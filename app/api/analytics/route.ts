import { getD1 } from "../../../db";
import { requireApiAccess } from "../../api-auth";

export async function GET(){const denied=await requireApiAccess();if(denied)return denied;try{const d1=getD1();const [summary,orders,trends]=await Promise.all([
  d1.prepare(`SELECT
    COALESCE((SELECT SUM(quantity * unit_price) FROM order_items),0) revenue,
    COALESCE((SELECT SUM(ABS(t.grams) * b.cost_per_kg / 1000.0) FROM inventory_transactions t JOIN material_batches b ON b.id=t.batch_id WHERE t.type='打印消耗'),0) material_cost,
    COALESCE((SELECT SUM(MAX(0,(julianday(j.completed_at)-julianday(j.started_at))*24) * COALESCE(p.hourly_rate,0)) FROM print_jobs j LEFT JOIN printers p ON p.name=j.printer_name WHERE j.completed_at IS NOT NULL),0) machine_cost,
    (SELECT COUNT(*) FROM print_jobs WHERE status='已完成') completed,
    (SELECT COUNT(*) FROM print_jobs WHERE status IN ('已完成','失败','已取消')) terminal,
    COALESCE((SELECT SUM(MAX(0,(julianday(j.completed_at)-julianday(j.started_at))*24)) FROM print_jobs j WHERE j.completed_at IS NOT NULL AND datetime(j.completed_at)>=datetime('now','-30 days')),0) productive_hours,
    (SELECT COUNT(*) FROM printers WHERE status!='停用') active_printers`).first<Record<string,number>>(),
  d1.prepare(`SELECT o.order_no orderNo,o.customer,o.status,COALESCE((SELECT SUM(oi.quantity*oi.unit_price) FROM order_items oi WHERE oi.order_id=o.id),0) revenue,(SELECT COUNT(*) FROM print_jobs j WHERE j.order_id=o.id) jobs,(SELECT COUNT(*) FROM print_jobs j WHERE j.order_id=o.id AND j.status='已完成') completedJobs FROM orders o ORDER BY o.created_at DESC LIMIT 20`).all(),
  d1.prepare(`WITH RECURSIVE days(day) AS (SELECT date('now','-6 days') UNION ALL SELECT date(day,'+1 day') FROM days WHERE day<date('now')) SELECT day,COUNT(j.id) completed FROM days LEFT JOIN print_jobs j ON date(j.completed_at)=day AND j.status='已完成' GROUP BY day ORDER BY day`).all()
]);const s=summary||{};const revenue=Number(s.revenue||0),materialCost=Number(s.material_cost||0),machineCost=Number(s.machine_cost||0),totalCost=materialCost+machineCost;return Response.json({summary:{revenue,materialCost,machineCost,totalCost,grossProfit:revenue-totalCost,margin:revenue?((revenue-totalCost)/revenue*100):0,successRate:Number(s.terminal)?Number(s.completed)/Number(s.terminal)*100:0,utilization:Number(s.active_printers)?Number(s.productive_hours)/(Number(s.active_printers)*30*24)*100:0,completed:Number(s.completed||0)},orders:orders.results,trends:trends.results});}catch(error){return Response.json({error:error instanceof Error?error.message:"分析数据读取失败"},{status:500});}}
