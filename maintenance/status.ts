export type MaintenanceStatus="scheduled"|"due"|"overdue"|"in_progress"|"completed"|"cancelled";
export type MaintenanceClock={status:string;dueAt?:string|null;dueHours?:number|null;totalHours:number;now?:Date};

export function effectiveMaintenanceStatus(input:MaintenanceClock):MaintenanceStatus{
  if(["completed","cancelled","in_progress"].includes(input.status))return input.status as MaintenanceStatus;
  const now=input.now??new Date(),dateDue=input.dueAt?new Date(input.dueAt):null;
  const hoursOver=input.dueHours!=null&&input.totalHours>input.dueHours;
  const dateOver=!!dateDue&&!Number.isNaN(dateDue.valueOf())&&now>dateDue;
  if(hoursOver||dateOver)return "overdue";
  const hoursDue=input.dueHours!=null&&input.totalHours>=input.dueHours;
  const dateSoon=!!dateDue&&!Number.isNaN(dateDue.valueOf())&&dateDue.valueOf()-now.valueOf()<=7*86400000;
  return hoursDue||dateSoon||input.status==="due"?"due":"scheduled";
}
