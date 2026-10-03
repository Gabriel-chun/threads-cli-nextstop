"use client";

import { useEffect } from "react";
import { useI18n } from "../components/I18nProvider";

export default function ErrorPage({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
  const {t}=useI18n();
  useEffect(()=>{ console.error(error); },[error]);
  return <main className="networkWorkspace"><section className="panel"><h2>{t("common.error")}</h2><p className="muted">{error.message}</p><button type="button" className="backButton" onClick={reset}>{t("common.retry")}</button></section></main>;
}
