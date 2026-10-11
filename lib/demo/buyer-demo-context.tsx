"use client";
import { createContext, useContext } from "react";
import type { BuyerDemoSession } from "./buyer-demo-session";
// Only /demo mounts this provider. It is a client simulation seam, never an auth gate.
export const BuyerDemoContext = createContext<BuyerDemoSession | null>(null);
export const useBuyerDemo = () => useContext(BuyerDemoContext);
