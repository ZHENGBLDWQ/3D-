import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import MaintenanceClient from "./maintenance-client";
import "./maintenance.css";

export const dynamic="force-dynamic";
export default async function MaintenancePage(){
  const user=await getAccessContext();if(!user)redirect("/");
  return <MaintenanceClient/>;
}
