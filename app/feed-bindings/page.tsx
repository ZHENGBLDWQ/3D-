import {redirect} from "next/navigation";
import {getAccessContext} from "../access-control";
import FeedBindingClient from "./feed-binding-client";

export const dynamic="force-dynamic";
export default async function FeedBindingsPage(){const user=await getAccessContext();if(!user)redirect("/");return <FeedBindingClient/>}
