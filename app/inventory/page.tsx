import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import InventoryV2Client from "./inventory-v2-client";
import "./inventory-v2.css";
export const dynamic="force-dynamic";
export default async function InventoryPage(){const user=await getAccessContext();if(!user)redirect("/");return <InventoryV2Client/>}
