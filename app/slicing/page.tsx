import { redirect } from "next/navigation";
import { getAccessContext } from "../access-control";
import SlicingClient from "./slicing-client";
export const dynamic = "force-dynamic";
export default async function SlicingPage() { const user = await getAccessContext(); if (!user) redirect("/"); return <SlicingClient canWrite={["owner", "manager", "orders"].includes(user.role)} />; }
