import express from "express";
import fetch from "node-fetch";
import { v2 as cloudinary } from "cloudinary";

const app = express();

app.use(express.json({ limit: "25mb" }));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent";

function debugLog(label, value) {
  console.log(`\n========== ${label} ==========`);
  console.log(JSON.stringify(value, null, 2));
}

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getField(body, possibleNames) {
  if (!body || typeof body !== "object") return undefined;

  const sources = [
    body,
    body.data,
    body.row,
    body.values,
    body.columns,
    body.fields,
  ].filter((source) => source && typeof source === "object");

  for (const source of sources) {
    const entries = Object.entries(source);

    for (const name of possibleNames) {
      const wanted = normalizeKey(name);

      const match = entries.find(([key]) => normalizeKey(key) === wanted);

      if (match) return match[1];
    }
  }

  return undefined;
}

function firstImageUrl(value) {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstImageUrl(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "string") {
    return (
      value
        .split(",")
        .map((item) => item.trim())
        .find((item) => item.startsWith("http")) || null
    );
  }

  if (typeof value === "object") {
    return (
      value.url ||
      value.src ||
      value.image ||
      value.secure_url ||
      value.original_url ||
      value.file_url ||
      null
    );
  }

  return null;
}

async function imageUrlToBase64(label, value) {
  const url = firstImageUrl(value);

  console.log(`${label} raw value:`, value);
  console.log(`${label} extracted URL:`, url);

  if (!url) return null;

  const response = await fetch(url);

  console.log(`${label} fetch status:`, response.status);
  console.log(`${label} content-type:`, response.headers.get("content-type"));

  if (!response.ok) {
    throw new Error(`${label}: Failed to fetch image: ${url}`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    mime_type: contentType,
    data: buffer.toString("base64"),
  };
}

app.get("/", (req, res) => {
  res.send("Wardrobed API is running");
});

app.post("/generate-outfit", async (req, res) => {
  try {
    console.log("\n\n========== NEW /generate-outfit REQUEST ==========");
    debugLog("REQUEST BODY", req.body);

    const rowId = getField(req.body, ["rowId", "Row ID", "RowID"]);
    const outfitName = getField(req.body, [
      "outfitName",
      "OutfitName",
      "Outfit Name",
    ]);

    const ownerEmail = getField(req.body, [
      "ownerEmail",
      "Owner Email",
      "OwnerEmail",
    ]);

    const modelPhoto = getField(req.body, [
      "modelPhoto",
      "Model Photo",
      "ModelPhoto",
      "modelImage",
      "Model Image",
    ]);

    const topImage = getField(req.body, [
      "topImage",
      "TopImage",
      "Top Image",
    ]);

    const bottomImage = getField(req.body, [
      "bottomImage",
      "BottomImage",
      "Bottom Image",
    ]);

    const shoesImage = getField(req.body, [
      "shoesImage",
      "ShoesImage",
      "Shoes Image",
    ]);

    const outerwearImage = getField(req.body, [
      "outerwearImage",
      "OuterwearImage",
      "Outerwear Image",
    ]);

    const accessoriesImage = getField(req.body, [
      "accessoriesImage",
      "AccessoriesImage",
      "Accessories Image",
    ]);

    debugLog("ENV CHECK", {
      hasGeminiKey: Boolean(GEMINI_API_KEY),
      hasCloudinaryCloudName: Boolean(process.env.CLOUDINARY_CLOUD_NAME),
      hasCloudinaryApiKey: Boolean(process.env.CLOUDINARY_API_KEY),
      hasCloudinaryApiSecret: Boolean(process.env.CLOUDINARY_API_SECRET),
    });

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Missing GEMINI_API_KEY",
      });
    }

    const extractedUrls = {
      modelPhoto: firstImageUrl(modelPhoto),
      topImage: firstImageUrl(topImage),
      bottomImage: firstImageUrl(bottomImage),
      shoesImage: firstImageUrl(shoesImage),
      outerwearImage: firstImageUrl(outerwearImage),
      accessoriesImage: firstImageUrl(accessoriesImage),
    };

    debugLog("EXTRACTED IMAGE URLS", extractedUrls);

    const images = await Promise.all([
      imageUrlToBase64("modelPhoto", modelPhoto),
      imageUrlToBase64("topImage", topImage),
      imageUrlToBase64("bottomImage", bottomImage),
      imageUrlToBase64("shoesImage", shoesImage),
      imageUrlToBase64("outerwearImage", outerwearImage),
      imageUrlToBase64("accessoriesImage", accessoriesImage),
    ]);

    const validImages = images.filter(Boolean);

    console.log("Valid image count:", validImages.length);

    if (!validImages.length) {
      return res.status(400).json({
        error: "No valid image URLs were provided",
        extractedUrls,
        received: {
          modelPhoto,
          topImage,
          bottomImage,
          shoesImage,
          outerwearImage,
          accessoriesImage,
        },
      });
    }

    const parts = [
      {
        text: `
Create a photorealistic full-body fashion try-on image.

INPUT ORDER:
- Image 1: ModelPhoto/person if provided
- Image 2+: Clothing items in this order:
  TopImage, BottomImage, ShoesImage, OuterwearImage optional, AccessoriesImage optional

STRICT REQUIREMENTS:
- Preserve the model's face, skin tone, hair, body shape, and proportions if ModelPhoto is provided.
- Apply ONLY the provided clothing items.
- TopImage goes on torso.
- BottomImage goes on legs.
- ShoesImage goes on feet.
- OuterwearImage goes over the top if present.
- AccessoriesImage goes in the appropriate place if present.
- Do not invent or replace clothing.
- Full-body view, standing forward.
- Clean white or neutral studio background.
- Soft, even lighting.
- Return only one final image.
        `.trim(),
      },
      ...validImages.map((image) => ({
        inlineData: {
          mimeType: image.mime_type,
          data: image.data,
        },
      })),
    ];

    console.log("Calling Gemini...");

    const geminiResponse = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts }],
      }),
    });

    const geminiData = await geminiResponse.json();

    console.log("Gemini status:", geminiResponse.status);
    debugLog("GEMINI RESPONSE", geminiData);

    if (!geminiResponse.ok) {
      return res.status(geminiResponse.status).json({
        error: "Gemini API failed",
        status: geminiResponse.status,
        details: geminiData,
      });
    }

    const imagePart = geminiData.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData?.data || part.inline_data?.data
    );

    if (!imagePart) {
      return res.status(500).json({
        error: "No generated image returned",
        raw: geminiData,
      });
    }

    const generatedBase64 =
      imagePart.inlineData?.data || imagePart.inline_data?.data;

    const mimeType =
      imagePart.inlineData?.mimeType ||
      imagePart.inline_data?.mime_type ||
      "image/png";

    console.log("Uploading to Cloudinary...");

    const upload = await cloudinary.uploader.upload(
      `data:${mimeType};base64,${generatedBase64}`,
      {
        folder: "glide-outfits",
        public_id: rowId || undefined,
        overwrite: true,
      }
    );

    debugLog("CLOUDINARY UPLOAD", upload);

    return res.json({
      rowId,
      outfitName,
      ownerEmail,
      imageUrl: upload.secure_url,
      outfitImage: upload.secure_url,
      status: "success",
    });
  } catch (err) {
    console.error("\n========== GENERATE OUTFIT ERROR ==========");
    console.error(err);

    return res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
