import { redirect } from "next/navigation";
import { getAccessContext } from "../access-control";
import SchedulingClient from "./scheduling-client";
export const dynamic = "force-dynamic";
export default async function SchedulingPage() { const user = await getAccessContext(); if (!user) redirect("/"); return <SchedulingClient canConfirm={["owner", "manager", "orders"].includes(user.role)} />; }
