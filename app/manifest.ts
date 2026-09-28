import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest { return { name:"36 — Creative Studio Marketplace", short_name:"36", description:"Find and book independent creative studios in Morocco.", start_url:"/", display:"standalone", background_color:"#070806", theme_color:"#d9ff43", icons:[{src:"/icon.svg",sizes:"any",type:"image/svg+xml"}] }; }
