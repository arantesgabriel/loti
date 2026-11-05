import type { Metadata } from "next";
import { SignupScreen } from "@/components/signup-screen";
import "../login/login.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Criar conta", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function SignupPage() { return <SignupScreen />; }
