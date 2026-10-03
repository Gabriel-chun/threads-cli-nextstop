import type {
  EventState,
  ObservationEvent,
  SubscriptionRecord
} from "./core";
import { isSubscriptionActive } from "./core";
import { deliverEvent } from "./webhook";

const BACKOFF = [0, 1000, 4000];

type DeliveryStore = {
  acquireEventLock(eventId: string): Promise<boolean>;
  releaseEventLock(eventId: string): Promise<void>;
  getEventState(eventId: string): Promise<EventState | null>;
  putEventState(state: EventState): Promise<void>;
  listSubscriptions(): Promise<SubscriptionRecord[]>;
};

async function resolveStore(store?: DeliveryStore): Promise<DeliveryStore> {
  if (store) return store;
  const { EventStore } = await import("./store");
  return new EventStore();
}

export async function dispatchObservationEvent(
  event: ObservationEvent,
  store?: DeliveryStore
) {
  const activeStore = await resolveStore(store);

  if (!(await activeStore.acquireEventLock(event.eventId))) {
    const state = await activeStore.getEventState(event.eventId);
    return { duplicate: true, state };
  }

  try {
    let state = await activeStore.getEventState(event.eventId);
    if (
      state?.finalStatus === "completed" ||
      state?.finalStatus === "no_subscribers"
    ) {
      return { duplicate: true, state };
    }

    const subscriptions = (await activeStore.listSubscriptions()).filter(
      (subscription) =>
        isSubscriptionActive(subscription) &&
        Date.parse(subscription.createdAt) <= Date.parse(event.timestamp)
    );

    if (!state) {
      const now = new Date().toISOString();
      state = {
        eventId: event.eventId,
        runId: event.data.run_id,
        observationId: event.data.observation_id,
        occurredAt: event.timestamp,
        createdAt: now,
        updatedAt: now,
        targetSubscriptionIds: subscriptions.map((subscription) => subscription.id),
        deliveries: Object.fromEntries(
          subscriptions.map((subscription) => [
            subscription.id,
            {
              subscriptionId: subscription.id,
              status: "pending",
              attempts: 0,
              updatedAt: now
            }
          ])
        ),
        finalStatus: subscriptions.length ? "emitted" : "no_subscribers"
      } satisfies EventState;
      await activeStore.putEventState(state);
    }

    if (!state.targetSubscriptionIds.length) {
      return { duplicate: false, state };
    }

    const subscriptionsById = new Map(
      subscriptions.map((subscription) => [subscription.id, subscription])
    );

    for (const id of state.targetSubscriptionIds) {
      const prior = state.deliveries[id];
      if (prior?.status === "delivered" || prior?.status === "skipped") continue;

      const subscription = subscriptionsById.get(id);
      if (!subscription) {
        state.deliveries[id] = {
          subscriptionId: id,
          status: "skipped",
          attempts: prior?.attempts || 0,
          lastError: "subscription_missing_or_expired",
          updatedAt: new Date().toISOString()
        };
        await activeStore.putEventState(state);
        continue;
      }

      let attempts = prior?.attempts || 0;
      let delivered = false;
      let terminal = false;
      let lastHttp: number | null = null;
      let lastError: string | null = null;

      while (!delivered && !terminal && attempts < 3) {
        if (BACKOFF[attempts]) {
          await new Promise((resolve) => setTimeout(resolve, BACKOFF[attempts]));
        }

        attempts += 1;
        try {
          const response = await deliverEvent(subscription, event);
          lastHttp = response.status;
          delivered = response.status >= 200 && response.status < 300;
          terminal =
            response.status === 410 ||
            response.status === 413 ||
            (!delivered &&
              response.status < 500 &&
              ![408, 425, 429].includes(response.status));
          if (!delivered) lastError = "http_" + response.status;
        } catch (error) {
          lastError = error instanceof Error ? error.message : "network_error";
        }

        state.deliveries[id] = {
          subscriptionId: id,
          status: delivered ? "delivered" : "pending",
          attempts,
          lastHttpStatus: lastHttp,
          lastError,
          updatedAt: new Date().toISOString()
        };
        state.updatedAt = new Date().toISOString();
        await activeStore.putEventState(state);
      }

      if (!delivered) {
        state.deliveries[id] = {
          subscriptionId: id,
          status: "failed",
          attempts,
          lastHttpStatus: lastHttp,
          lastError,
          updatedAt: new Date().toISOString()
        };
        await activeStore.putEventState(state);
      }
    }

    const values = Object.values(state.deliveries);
    state.finalStatus = values.some((delivery) => delivery.status === "failed")
      ? "partial_failure"
      : "completed";
    state.updatedAt = new Date().toISOString();
    await activeStore.putEventState(state);
    return { duplicate: false, state };
  } finally {
    await activeStore.releaseEventLock(event.eventId);
  }
}
