import {LogisticsPackageDetail} from "@/components/orders/logistics-package-detail";
export default async function LogisticsPackagePage({params,searchParams}:{params:Promise<{packageId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const [route,query]=await Promise.all([params,searchParams]);
  const candidate=Array.isArray(query.returnTo)?query.returnTo[0]:query.returnTo;
  const returnTo=candidate==="/packages"||candidate?.startsWith("/packages?")?candidate:"/packages";
  return <LogisticsPackageDetail packageId={route.packageId} returnTo={returnTo}/>;
}
