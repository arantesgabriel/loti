import {LogisticsPackageDetail} from "@/components/orders/logistics-package-detail";
export default async function LogisticsPackagePage({params}:{params:Promise<{packageId:string}>}){return <LogisticsPackageDetail packageId={(await params).packageId}/>;}
