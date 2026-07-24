import { redirect } from "next/navigation";
import { can, getAccessContext } from "../access-control";
import styles from "./settings.module.css";

export const dynamic="force-dynamic";

export default async function SettingsHubPage(){
 const user=await getAccessContext(); if(!user)redirect("/");
 const system=can(user,"system.manage"), team=can(user,"team.manage"), finance=can(user,"finance.read");
 const groups=[
  {title:"组织与权限",items:[{href:"/team",name:"员工与权限",note:"账号、岗位、停用与操作审计",show:team}]},
  {title:"数据采集",items:[{href:"/gateways",name:"通信网关",note:"管理只读打印机数据接入与 Agent 状态",show:system},{href:"/fleet",name:"打印机档案",note:"查看已接入设备与 AMS 实时状态",show:true},{href:"/alerts",name:"告警中心",note:"处理离线、耗材与业务异常",show:true}]},
  {title:"经营规则",items:[{href:"/",name:"成本参数",note:"电价、人工、设备和管理分摊参数",show:finance},{href:"/procurement",name:"采购与补货规则",note:"安全库存、在途收货和补货建议",show:true}]},
  {title:"安全与恢复",items:[{href:"/operations",name:"上线检查",note:"依赖、迁移、认证、备份和网关生产就绪度",show:system},{href:"/recovery",name:"备份恢复",note:"安全导出、完整性验证和恢复演练",show:system}]},
 ];
 return <main className={styles.page}><header><a href="/">← 返回工作台</a><div><small>SYSTEM CONFIGURATION</small><h1>系统设置</h1><p>集中管理账号、数据采集、经营规则、告警和数据安全。这里不提供打印机操作。</p></div><span>{user.displayName}<b>{user.role}</b></span></header>
 <section className={styles.boundary}><b>只读监控原则</b><p>打印、暂停、停止、切片参数和设备操作继续由 Bambu Studio 或打印机执行；LayerTrace 只采集状态并管理经营数据。</p></section>
 <section className={styles.groups}>{groups.map(group=>{const items=group.items.filter(x=>x.show);if(!items.length)return null;return <article key={group.title}><h2>{group.title}</h2>{items.map(item=><a href={item.href} key={item.name}><div><b>{item.name}</b><span>{item.note}</span></div><i>→</i></a>)}</article>})}</section>
 </main>
}
