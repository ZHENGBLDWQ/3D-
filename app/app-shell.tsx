"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import type {ReactNode} from "react";

const primary=[
  {label:"首页工作台",mark:"⌂",href:"/"},
  {label:"订单中心",mark:"▣",href:"/orders"},
  {label:"实时打印监控",mark:"◉",href:"/monitor"},
  {label:"耗材库存",mark:"◌",href:"/inventory"},
  {label:"成本与定价",mark:"RM",href:"/costing"},
  {label:"经营分析",mark:"▥",href:"/analytics"},
  {label:"系统设置",mark:"⚙",href:"/settings"},
] as const;

const moduleGroups=[
  {root:"/orders",label:"订单中心",paths:["/orders","/quotes","/fulfillment","/receivables","/after-sales"],items:[
    {href:"/orders",label:"订单管理"},{href:"/quotes",label:"报价中心"},{href:"/fulfillment",label:"交付履约"},{href:"/receivables",label:"应收账款"},{href:"/after-sales",label:"售后返工"},
  ]},
  {root:"/monitor",label:"实时打印监控",paths:["/monitor","/fleet","/gateways","/settlements","/calibration","/maintenance"],items:[
    {href:"/monitor",label:"实时监控"},{href:"/fleet",label:"设备档案"},{href:"/gateways",label:"通信网关"},{href:"/settlements",label:"打印结算"},{href:"/calibration",label:"称重校准"},{href:"/maintenance",label:"维护保养"},
  ]},
  {root:"/inventory",label:"耗材库存",paths:["/inventory","/feed-bindings","/material-master","/material-variances","/inventory-value","/procurement","/replenishment-forecast"],items:[
    {href:"/inventory",label:"库存总览"},{href:"/feed-bindings",label:"使用中耗材"},{href:"/material-master",label:"耗材主数据"},{href:"/material-variances",label:"盘点差异"},{href:"/inventory-value",label:"库存价值"},{href:"/procurement",label:"采购补货"},{href:"/replenishment-forecast",label:"补货预测"},
  ]},
  {root:"/costing",label:"成本与定价",paths:["/costing","/settlements","/profit","/quotes"],items:[
    {href:"/costing",label:"成本核算"},{href:"/settlements",label:"打印结算"},{href:"/profit",label:"利润分析"},{href:"/quotes",label:"报价中心"},
  ]},
  {root:"/analytics",label:"经营分析",paths:["/analytics","/management-report","/supplier-performance","/cashflow","/business-targets","/profit"],items:[
    {href:"/analytics",label:"经营驾驶舱"},{href:"/management-report",label:"经营月报"},{href:"/profit",label:"利润分析"},{href:"/cashflow",label:"现金流预测"},{href:"/business-targets",label:"经营目标"},{href:"/supplier-performance",label:"供应商绩效"},
  ]},
  {root:"/settings",label:"系统设置",paths:["/settings","/team","/alerts","/data-quality","/operations","/recovery"],items:[
    {href:"/settings",label:"设置首页"},{href:"/team",label:"员工与权限"},{href:"/alerts",label:"告警中心"},{href:"/data-quality",label:"数据质量"},{href:"/operations",label:"上线检查"},{href:"/recovery",label:"备份恢复"},
  ]},
] as const;

function matches(pathname:string,href:string){return href==="/"?pathname==="/":pathname===href||pathname.startsWith(`${href}/`)}

export default function AppShell({children,user}:{children:ReactNode;user:{displayName:string}}){
  const pathname=usePathname()||"/";
  const group=moduleGroups.find(item=>item.paths.some(path=>matches(pathname,path)));
  return <main className="app-frame">
    <aside className="sidebar app-sidebar">
      <Link className="brand" href="/" aria-label="返回首页">
        <span className="brand-cube">3D</span><div><strong>层迹</strong><small>PRINT OPS</small></div>
      </Link>
      <nav><div className="nav-group"><p className="nav-title">经营管理</p>{primary.map(item=>{
        const active=item.href==="/"?pathname==="/":group?.root===item.href;
        return <Link className={active?"main-nav-link nav-active":"main-nav-link"} aria-current={active?"page":undefined} href={item.href} title={item.label} key={item.href}><span>{item.mark}</span><em>{item.label}</em></Link>
      })}</div></nav>
      <div className="sidebar-bottom"><div className="system-state"><i/> 数据已同步</div><div className="profile"><span>{user.displayName.slice(0,1)||"管"}</span><div><strong>{user.displayName}</strong><small>私有工作区</small></div><em>•••</em></div></div>
    </aside>
    <section className="app-main">
      {group?<nav className="module-context" aria-label={`${group.label}功能模块`}><div><small>当前模块</small><strong>{group.label}</strong></div><div className="module-context-links">{group.items.map(item=><Link className={matches(pathname,item.href)?"active":""} aria-current={matches(pathname,item.href)?"page":undefined} href={item.href} key={item.href}>{item.label}</Link>)}</div></nav>:null}
      <div className="app-route-content">{children}</div>
    </section>
  </main>
}
