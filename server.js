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

function firstImageUrl(value) {
  if (!value) return null;

  if (Array.isArray(value)) {
    return firstImageUrl(value[0]);
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
    return value.url || value.src || value.image || value.secure_url || null;
  }

  return null;
}

function needsGeneratedOutfitName(outfitName) {
  return (
    !outfitName ||
    String(outfitName).trim() === "" ||
    String(outfitName).trim().toLowerCase() === "my outfit"
  );
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

async function generateOutfitNameFromImages(validImages) {
  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `
Generate a short stylish outfit name based only on the provided clothing images.

Rules:
- 2 to 5 words maximum
- Fashion/app style name
- No quotes
- No explanations
- Do not say "My Outfit"
              `.trim(),
            },
            ...validImages.map((image) => ({
              inlineData: {
                mimeType: image.mime_type,
                data: image.data,
              },
            })),
          ],
        },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.log("Outfit name generation failed:", data);
    return "Styled Outfit";
  }

  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join(" ")
      .replace(/["']/g, "")
      .trim() || "Styled Outfit"
  );
}

app.get("/", (req, res) => {
  res.send("Wardrobed API is running");
});

app.post("/generate-outfit", async (req, res) => {
  try {
    console.log("\n\n========== NEW /generate-outfit REQUEST ==========");
    debugLog("REQUEST BODY", req.body);

    const rowId = req.body.rowId || req.body["Row ID"];
    let outfitName = req.body.outfitName || req.body.OutfitName;

    const topImage = req.body.topImage || req.body.TopImage;
    const bottomImage = req.body.bottomImage || req.body.BottomImage;
    const shoesImage = req.body.shoesImage || req.body.ShoesImage;
    const outerwearImage = req.body.outerwearImage || req.body.OuterwearImage;

    const accessoriesImage =
      req.body.accessoriesImage || req.body.AccessoriesImage;

    const accessoriesImage1 =
      req.body.accessoriesImage1 || req.body.AccessoriesImage1;

    const accessoriesImage2 =
      req.body.accessoriesImage2 || req.body.AccessoriesImage2;

    const accessoriesImage3 =
      req.body.accessoriesImage3 || req.body.AccessoriesImage3;

    const accessoriesImage4 =
      req.body.accessoriesImage4 || req.body.AccessoriesImage4;

    const modelPhoto = req.body.modelPhoto || req.body["Model Photo"];
    const ownerEmail = req.body.ownerEmail || req.body["Owner Email"];

    const height = req.body.height || req.body.Height;
    const age = req.body.age || req.body.Age;

    debugLog("PERSON DETAILS", {
      height,
      age,
    });

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
      accessoriesImage1: firstImageUrl(accessoriesImage1),
      accessoriesImage2: firstImageUrl(accessoriesImage2),
      accessoriesImage3: firstImageUrl(accessoriesImage3),
      accessoriesImage4: firstImageUrl(accessoriesImage4),
    };

    debugLog("EXTRACTED IMAGE URLS", extractedUrls);

    const images = await Promise.all([
      imageUrlToBase64("modelPhoto", modelPhoto),
      imageUrlToBase64("topImage", topImage),
      imageUrlToBase64("bottomImage", bottomImage),
      imageUrlToBase64("shoesImage", shoesImage),
      imageUrlToBase64("outerwearImage", outerwearImage),
      imageUrlToBase64("accessoriesImage", accessoriesImage),
      imageUrlToBase64("accessoriesImage1", accessoriesImage1),
      imageUrlToBase64("accessoriesImage2", accessoriesImage2),
      imageUrlToBase64("accessoriesImage3", accessoriesImage3),
      imageUrlToBase64("accessoriesImage4", accessoriesImage4),
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
          accessoriesImage1,
          accessoriesImage2,
          accessoriesImage3,
          accessoriesImage4,
          height,
          age,
        },
      });
    }

    if (needsGeneratedOutfitName(outfitName)) {
      outfitName = await generateOutfitNameFromImages(validImages);
    }

    const personDetailsPrompt = `
PERSON DETAILS:
- Age: ${age || "unknown"}
- Height: ${height || "unknown"} cm

PERSON DETAIL REQUIREMENTS:
- Use the provided age to reflect realistic facial maturity and overall appearance.
- Use the provided height to guide realistic body proportions and clothing scale.
- If height is unknown, preserve the proportions from ModelPhoto.
- If age is unknown, preserve the apparent age from ModelPhoto.
- Do not make the person look younger or older than the provided age.
- Do not exaggerate height. Keep proportions natural and realistic.
    `.trim();

    const parts = [
      {
        text: `
Create a photorealistic full-body fashion try-on image.

${personDetailsPrompt}

INPUT ORDER:
- Image 1: ModelPhoto (person)
- Image 2+: Clothing items in this order:
  TopImage, BottomImage, ShoesImage, OuterwearImage (optional),
  AccessoriesImage, AccessoriesImage1, AccessoriesImage2, AccessoriesImage3, AccessoriesImage4 (optional)

STRICT REQUIREMENTS:

IDENTITY:
- Preserve the exact face, facial features, skin tone, hair, and identity from ModelPhoto.
- Preserve the person's natural body type from ModelPhoto.
- Slightly adjust body proportions ONLY if needed to match the provided height realistically.
- Do not beautify, stylize, or modify the person's identity.

CLOTHING APPLICATION:
- Apply ONLY the provided clothing items.
- Map each item correctly:
  TopImage → torso
  BottomImage → legs
  ShoesImage → feet
  OuterwearImage → over top, if present
  AccessoriesImage → appropriate accessory placement, if present
  AccessoriesImage1 → appropriate accessory placement, if present
  AccessoriesImage2 → appropriate accessory placement, if present
  AccessoriesImage3 → appropriate accessory placement, if present
  AccessoriesImage4 → appropriate accessory placement, if present
- Do NOT invent, replace, or hallucinate any clothing or accessories.
- If a clothing item is missing, leave that area neutral and minimal.
- If multiple accessories are provided, include all visible accessories naturally without overcrowding.

FIT & REALISM:
- Clothing must align naturally with the body using correct scale, folds, and perspective.
- Ensure clothing scale matches a real person with height: ${height || "unknown"} cm.
- Ensure age appearance matches: ${age || "unknown"}.
- Ensure proper layering, especially outerwear over the top.
- Maintain realistic fabric behavior, shadows, and contact with the body.
- Accessories should match realistic scale and placement.

POSE & FRAMING:
- Full-body view from head to toe.
- Natural upright standing pose facing forward.
- Arms slightly away from the body for visibility.
- Center the person in the frame.
- Leave balanced empty space around the person.

BACKGROUND & LIGHTING:
- Clean seamless white or very light neutral studio background.
- No clutter, no props, no text, no logos, no watermark.
- Soft even studio lighting.
- No dramatic shadows, no stylization, no effects.

IMAGE QUALITY:
- Generate a crisp, clean, photorealistic image.
- No pixelation, no blur, no compression artifacts.
- No distorted hands, face, limbs, shoes, or accessories.
- High-resolution fashion catalog quality.

COMPOSITION:
- Final image must be 4:3 aspect ratio.
- Clean product-style fashion try-on composition.

OUTPUT:
- Return ONLY one final image.
- No text.
- No explanation.
- No multiple variations.
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

    const finalImageUrl = cloudinary.url(upload.public_id, {
      secure: true,
      transformation: [
        {
          aspect_ratio: "4:3",
          crop: "fill",
          gravity: "auto",
          width: 1600,
          height: 1200,
          quality: "auto:best",
          fetch_format: "auto",
        },
      ],
    });

    debugLog("CLOUDINARY UPLOAD", upload);

    return res.json({
      rowId,

      OutfitName: outfitName,
      outfitName,

      ownerEmail,

      height,
      age,

      imageUrl: finalImageUrl,
      outfitImage: finalImageUrl,
      OutfitImage: finalImageUrl,

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
