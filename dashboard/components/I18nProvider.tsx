"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { translate, type TranslationValues, type UiLocale } from "../lib/i18n";

const STORAGE_KEY = "next-stop-live:ui-language:v1";
type CountUnit = "sample"|"connection"|"evidence"|"author"|"query"|"card"|"entity";
type I18nContextValue = {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  t: (key: string, values?: TranslationValues) => string;
  formatDate: (value?: string|null) => string;
  formatShortDate: (value: string) => string;
  formatNumber: (value: number) => string;
  formatCount: (value: number, unit: CountUnit) => string;
};
const I18nContext = createContext<I18nContextValue|null>(null);

function makeDateFormatter(locale: UiLocale) {
  if (locale === "zh-TW") return new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});
  return new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true});
}

export function I18nProvider({children}:{children:React.ReactNode}) {
  const [locale,setLocaleState] = useState<UiLocale>("zh-TW");
  useEffect(()=>{ try { const saved=globalThis.localStorage.getItem(STORAGE_KEY); if(saved==="zh-TW"||saved==="en") setLocaleState(saved); } catch {} },[]);
  useEffect(()=>{ document.documentElement.lang=locale==="zh-TW"?"zh-Hant":"en"; document.documentElement.dataset.uiLanguage=locale; },[locale]);
  function setLocale(next:UiLocale){ setLocaleState(next); try { globalThis.localStorage.setItem(STORAGE_KEY,next); } catch {} }
  const value=useMemo<I18nContextValue>(()=>({
    locale,setLocale,
    t:(key,values)=>translate(locale,key,values),
    formatDate:(value)=>{ if(!value) return "—"; const d=new Date(value); return Number.isNaN(d.getTime())?String(value):makeDateFormatter(locale).format(d); },
    formatShortDate:(value)=>{ const d=new Date(value+"T00:00:00+08:00"); if(Number.isNaN(d.getTime())) return value; return locale==="zh-TW" ? new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",month:"2-digit",day:"2-digit"}).format(d) : new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",month:"short",day:"numeric"}).format(d); },
    formatNumber:(value)=>new Intl.NumberFormat(locale==="zh-TW"?"zh-TW":"en-US").format(value),
    formatCount:(value,unit)=>{
      const n=new Intl.NumberFormat(locale==="zh-TW"?"zh-TW":"en-US").format(value);
      if(locale==="zh-TW"){ const labels:Record<CountUnit,string>={sample:"個樣本",connection:"條連結",evidence:"則證據",author:"位作者",query:"個查詢",card:"張卡片",entity:"個實體"}; return n+" "+labels[unit]; }
      const labels:Record<CountUnit,[string,string]>={sample:["sample","samples"],connection:["connection","connections"],evidence:["evidence item","evidence items"],author:["author","authors"],query:["query","queries"],card:["card","cards"],entity:["entity","entities"]}; return n+" "+labels[unit][value===1?0:1];
    }
  }),[locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(){ const value=useContext(I18nContext); if(!value) throw new Error("useI18n must be used inside I18nProvider"); return value; }
export function T({k,values}:{k:string;values?:TranslationValues}){ const {t}=useI18n(); return <>{t(k,values)}</>; }
export function LocaleDate({value}:{value?:string|null}){ const {formatDate}=useI18n(); return <>{formatDate(value)}</>; }
export function LocaleCount({value,unit}:{value:number;unit:CountUnit}){ const {formatCount}=useI18n(); return <>{formatCount(value,unit)}</>; }
