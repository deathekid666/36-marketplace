import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots { const base=process.env.NEXT_PUBLIC_APP_URL||"https://36.ma"; return { rules:[{userAgent:"*",allow:["/","/studios","/now"],disallow:["/admin","/owner","/creator","/api","/notifications"]}], sitemap:`${base}/sitemap.xml` }; }
