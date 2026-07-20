"use client";

import { FormEvent, useState } from "react";

export default function SetupForm() {
  const [error,setError] = useState("");
  const [saving,setSaving] = useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(form))});
    const result = await response.json() as {error?:string};
    if (!response.ok) { setError(result.error || "设置失败，请重试"); setSaving(false); return; }
    window.location.assign("/");
  }
  return <form className="signin-form" onSubmit={submit}>
    <label><span>管理员邮箱</span><input name="email" type="email" autoComplete="username" placeholder="name@example.com" required autoFocus /></label>
    <label><span>设置密码</span><input name="password" type="password" autoComplete="new-password" minLength={10} placeholder="至少 10 位" required /></label>
    <label><span>确认密码</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label>
    {error && <div className="signin-error" role="alert">{error}</div>}
    <button className="signin-button" type="submit" disabled={saving}>{saving?"正在创建…":"创建管理员并进入系统"}</button>
  </form>;
}
