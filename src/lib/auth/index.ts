import "server-only";
import { db } from "../db";
import { createAuth } from "./config";
export const auth = createAuth(db);
