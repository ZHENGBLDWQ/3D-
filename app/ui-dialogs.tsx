"use client";

import { FormEvent, ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Choice = { label:string; value:string; description?:string };
type BaseOptions = { title:string; message?:string; confirmLabel?:string; danger?:boolean };
type PromptOptions = BaseOptions & { defaultValue?:string; placeholder?:string; inputType?:"text"|"number"|"password"; choices?:Choice[] };
type DialogState = ({kind:"confirm"|"alert"}&BaseOptions)|({kind:"prompt"}&PromptOptions);
type DialogApi = {
  confirm:(options:BaseOptions)=>Promise<boolean>;
  prompt:(options:PromptOptions)=>Promise<string|null>;
  alert:(options:BaseOptions)=>Promise<void>;
};

const DialogContext=createContext<DialogApi|null>(null);

export function DialogProvider({children}:{children:ReactNode}) {
  const [dialog,setDialog]=useState<DialogState|null>(null);
  const resolver=useRef<((value:boolean|string|null)=>void)|null>(null);
  const open=useCallback(<T extends boolean|string|null>(next:DialogState)=>new Promise<T>(resolve=>{resolver.current=resolve as (value:boolean|string|null)=>void;setDialog(next)}),[]);
  const close=useCallback((value:boolean|string|null)=>{resolver.current?.(value);resolver.current=null;setDialog(null)},[]);
  useEffect(()=>{if(!dialog)return;const key=(event:KeyboardEvent)=>{if(event.key==="Escape"&&dialog.kind!=="alert")close(dialog.kind==="prompt"?null:false)};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[dialog,close]);
  const api:DialogApi={
    confirm:options=>open<boolean>({kind:"confirm",...options}),
    prompt:options=>open<string|null>({kind:"prompt",...options}),
    alert:options=>open<boolean>({kind:"alert",...options}).then(()=>undefined),
  };
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();close(String(new FormData(event.currentTarget).get("value")??""))}
  return <DialogContext.Provider value={api}>{children}{dialog&&<div className="ui-dialog-backdrop" role="presentation" onMouseDown={event=>event.target===event.currentTarget&&dialog.kind!=="alert"&&close(dialog.kind==="prompt"?null:false)}>
    <section className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="ui-dialog-title">
      <div className={`ui-dialog-icon ${dialog.danger?"danger":""}`}>{dialog.danger?"!":"LT"}</div>
      <div className="ui-dialog-copy"><h2 id="ui-dialog-title">{dialog.title}</h2>{dialog.message&&<p>{dialog.message}</p>}</div>
      {dialog.kind==="prompt"?<form onSubmit={submit}>
        {dialog.choices?<select name="value" defaultValue={dialog.defaultValue||dialog.choices[0]?.value} autoFocus>{dialog.choices.map(choice=><option value={choice.value} key={choice.value}>{choice.label}{choice.description?` · ${choice.description}`:""}</option>)}</select>:<input name="value" type={dialog.inputType||"text"} defaultValue={dialog.defaultValue} placeholder={dialog.placeholder} autoFocus required/>}
        <div className="ui-dialog-actions"><button type="button" onClick={()=>close(null)}>取消</button><button className={dialog.danger?"danger":"primary"}>{dialog.confirmLabel||"确认"}</button></div>
      </form>:<div className="ui-dialog-actions">{dialog.kind==="confirm"&&<button onClick={()=>close(false)}>取消</button>}<button className={dialog.danger?"danger":"primary"} autoFocus onClick={()=>close(true)}>{dialog.confirmLabel||(dialog.kind==="alert"?"我已保存":"确认")}</button></div>}
    </section>
  </div>}</DialogContext.Provider>;
}

export function useDialogs(){const value=useContext(DialogContext);if(!value)throw new Error("useDialogs must be used inside DialogProvider");return value}
