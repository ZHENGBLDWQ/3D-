import { desc, eq } from "drizzle-orm";
import { getDb, getFilesBucket } from "../../../db";
import { printFiles, printItems } from "../../../db/schema";
import { requireApiAccess } from "../../api-auth";

const allowedExtensions=new Set(["stl","3mf","gcode","gco","png","jpg","jpeg","webp"]);
const maxBytes=100*1024*1024;

export async function GET(request:Request){
  const denied=await requireApiAccess();if(denied)return denied;
  try{
    const url=new URL(request.url);const downloadId=Number(url.searchParams.get("download"));const db=getDb();
    if(downloadId){
      const [meta]=await db.select().from(printFiles).where(eq(printFiles.id,downloadId)).limit(1);
      if(!meta)return new Response("文件不存在",{status:404});const object=await getFilesBucket().get(meta.objectKey);if(!object)return new Response("文件内容不存在",{status:404});
      return new Response(object.body,{headers:{"Content-Type":meta.contentType,"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,"Content-Length":String(meta.sizeBytes)}});
    }
    const files=await db.select({id:printFiles.id,itemId:printFiles.itemId,itemName:printItems.name,filename:printFiles.filename,kind:printFiles.kind,version:printFiles.version,sizeBytes:printFiles.sizeBytes,contentType:printFiles.contentType,printerProfile:printFiles.printerProfile,layerHeight:printFiles.layerHeight,infillPercent:printFiles.infillPercent,estimatedMinutes:printFiles.estimatedMinutes,notes:printFiles.notes,createdAt:printFiles.createdAt}).from(printFiles).leftJoin(printItems,eq(printFiles.itemId,printItems.id)).orderBy(desc(printFiles.createdAt));
    return Response.json({files});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"读取文件失败"},{status:500});}
}

export async function POST(request:Request){
  const denied=await requireApiAccess(true);if(denied)return denied;
  try{
    const form=await request.formData();const upload=form.get("file");if(!(upload instanceof File))return Response.json({error:"请选择文件"},{status:400});
    const extension=upload.name.split(".").pop()?.toLowerCase()||"";if(!allowedExtensions.has(extension))return Response.json({error:"仅支持 STL、3MF、G-code、PNG、JPG 和 WebP"},{status:400});if(upload.size>maxBytes)return Response.json({error:"单个文件不能超过 100MB"},{status:400});
    const kind=["png","jpg","jpeg","webp"].includes(extension)?"图片":["gcode","gco"].includes(extension)?"G-code":"模型";
    const safeName=upload.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g,"_");const objectKey=`prints/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    await getFilesBucket().put(objectKey,upload.stream(),{httpMetadata:{contentType:upload.type||"application/octet-stream"},customMetadata:{originalName:upload.name}});
    try{
      const db=getDb();const [row]=await db.insert(printFiles).values({itemId:form.get("itemId")?Number(form.get("itemId")):null,filename:upload.name,objectKey,kind,version:String(form.get("version")||"v1"),sizeBytes:upload.size,contentType:upload.type||"application/octet-stream",printerProfile:String(form.get("printerProfile")||""),layerHeight:form.get("layerHeight")?Number(form.get("layerHeight")):null,infillPercent:form.get("infillPercent")?Number(form.get("infillPercent")):null,estimatedMinutes:form.get("estimatedMinutes")?Number(form.get("estimatedMinutes")):null,notes:String(form.get("notes")||"")}).returning();return Response.json({row},{status:201});
    }catch(error){await getFilesBucket().delete(objectKey);throw error;}
  }catch(error){return Response.json({error:error instanceof Error?error.message:"上传失败"},{status:500});}
}

export async function DELETE(request:Request){
  const denied=await requireApiAccess(true);if(denied)return denied;
  try{const id=Number(new URL(request.url).searchParams.get("id"));if(!id)return Response.json({error:"缺少文件标识"},{status:400});const db=getDb();const [meta]=await db.select().from(printFiles).where(eq(printFiles.id,id)).limit(1);if(!meta)return Response.json({error:"文件不存在"},{status:404});await getFilesBucket().delete(meta.objectKey);await db.delete(printFiles).where(eq(printFiles.id,id));return Response.json({ok:true});}catch(error){return Response.json({error:error instanceof Error?error.message:"删除失败"},{status:500});}
}
