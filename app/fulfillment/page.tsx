import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import FulfillmentClient from "./fulfillment-client";
import "./fulfillment.css";
export const dynamic="force-dynamic";
export default async function FulfillmentPage(){const user=await getAccessContext();if(!user)redirect("/");return <FulfillmentClient/>}
