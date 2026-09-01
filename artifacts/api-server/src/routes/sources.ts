import { Router, type IRouter } from "express";
import {
  CreateSourceBody,
  GetSourceParams,
} from "@workspace/api-zod";
import {
  createLocalSource,
  getLocalImage,
  getLocalSource,
  listLocalSources,
} from "../lib/source-store";

const router: IRouter = Router();

router.get("/v1/sources", (_req, res) => {
  res.json(listLocalSources());
});

router.post("/v1/sources", async (req, res) => {
  const parsed = CreateSourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid source payload.", code: "INVALID_SOURCE" });
    return;
  }
  try {
    const source = await createLocalSource(parsed.data);
    res.status(201).json(source);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Image source could not be created.",
      code: "INVALID_IMAGE",
    });
  }
});

router.get("/v1/sources/:sourceId", (req, res) => {
  const parsed = GetSourceParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid source id.", code: "INVALID_SOURCE_ID" });
    return;
  }
  const source = getLocalSource(parsed.data.sourceId);
  if (!source) {
    res.status(404).json({ error: "Source not found.", code: "SOURCE_NOT_FOUND" });
    return;
  }
  res.json({
    id: source.id,
    name: source.name,
    imageCount: source.images.length,
    images: source.images.map((image) => ({
      id: image.id,
      name: image.name,
      contentType: image.contentType,
      previewUrl: `/api/v1/sources/${source.id}/images/${image.id}`,
      width: image.width,
      height: image.height,
    })),
    createdAt: new Date(source.createdAt),
  });
});

router.get("/v1/sources/:sourceId/images/:imageId", (req, res) => {
  const source = getLocalSource(req.params.sourceId);
  const image = getLocalImage(req.params.sourceId, req.params.imageId);
  if (!source || !image) {
    res.status(404).json({ error: "Source image not found.", code: "IMAGE_NOT_FOUND" });
    return;
  }
  res.type(image.contentType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(image.filePath);
});

export default router;