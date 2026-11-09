import "dotenv/config";
import {client} from "../src/lib/db";
import {verifyDatabase} from "./database-verification";
try {console.log(JSON.stringify(await verifyDatabase(client)));} finally {client.close();}
