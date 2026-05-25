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

  if (Array.isArray(value)) return firstImageUrl(value[0]);

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

    const jumpsuitImage = req.body.jumpsuitImage || req.body.JumpsuitImage;
    const dressImage = req.body.dressImage || req.body.DressImage;

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
    const comments = req.body.comments || req.body.Comments;

    debugLog("PERSON DETAILS", {
      height,
      age,
      comments,
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
      jumpsuitImage: firstImageUrl(jumpsuitImage),
      dressImage: firstImageUrl(dressImage),
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
      imageUrlToBase64("jumpsuitImage", jumpsuitImage),
      imageUrlToBase64("dressImage", dressImage),
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
          jumpsuitImage,
          dressImage,
          accessoriesImage,
          accessoriesImage1,
          accessoriesImage2,
          accessoriesImage3,
          accessoriesImage4,
          height,
          age,
          comments,
        },
      });
    }

    if (needsGeneratedOutfitName(outfitName)) {
      outfitName = await generateOutfitNameFromImages(validImages);
    }

    const parts = [
      {
        text: `
Create a photorealistic full-body fashion try-on image.

PERSON DETAILS:
- Age: ${age || "unknown"}
- Height: ${height || "unknown"} cm

USER COMMENTS / STYLING NOTES:
${comments || "None"}

COMMENTS RULES:
- Use the comments only for styling guidance.
- Comments may affect fit or wear style, such as tucked, untucked, oversized, relaxed, sleeves rolled, or similar styling.
- Comments must NOT add new clothing items.
- Comments must NOT remove selected clothing items.
- Comments must NOT change the color, design, or category of selected clothing.
- If comments conflict with the clothing rules, ignore the conflicting part.

INPUT ORDER:
- Image 1: ModelPhoto/person
- Image 2+: Clothing items in this order:
  TopImage, BottomImage, ShoesImage,
  OuterwearImage,
  JumpsuitImage,
  DressImage,
  AccessoriesImage, AccessoriesImage1, AccessoriesImage2, AccessoriesImage3, AccessoriesImage4

IDENTITY:
- Preserve the person's facial identity, skin tone, hair, and likeness.
- Keep the person recognizable as the same individual.
- Adjust body proportions naturally to match the provided height.
- Adjust facial maturity and features to match the provided age.
- Do NOT freeze the body exactly as in the original image.

AGE & HEIGHT REALISM:
- The person should look like a realistic ${age || "unknown"}-year-old human.
- The body proportions must match a real person of ${height || "unknown"} cm height.
- Keep proportions natural and realistic.

CLOTHING APPLICATION:
- Apply ONLY the provided clothing items.
- Do NOT invent extra clothing.
- Do NOT add extra styling pieces.
- Do NOT add accessories unless an accessory image is provided.
- Do NOT change the design or color of the selected clothing.

MAPPING:
- TopImage → torso
- BottomImage → legs
- ShoesImage → feet
- OuterwearImage → layered over the outfit, if provided
- JumpsuitImage → full-body garment covering torso and legs
- DressImage → full-body garment covering torso and legs
- AccessoriesImage → appropriate accessory placement
- AccessoriesImage1 → appropriate accessory placement
- AccessoriesImage2 → appropriate accessory placement
- AccessoriesImage3 → appropriate accessory placement
- AccessoriesImage4 → appropriate accessory placement

FULL-BODY GARMENT RULES:
- If JumpsuitImage is provided, use it as the main outfit.
- If JumpsuitImage is provided, do NOT use TopImage or BottomImage.
- If JumpsuitImage is provided, do NOT add fallback top or fallback bottom.
- If DressImage is provided, use it as the main outfit.
- If DressImage is provided, do NOT use TopImage or BottomImage.
- If DressImage is provided, do NOT add fallback top or fallback bottom.
- If both JumpsuitImage and DressImage are provided, use only one of them.
- Do NOT combine a dress with pants unless the provided dress image clearly shows that styling.
- Do NOT combine a jumpsuit with separate top or bottom pieces.
- Outerwear may be layered over a dress or jumpsuit only if OuterwearImage is provided.

MISSING ITEM FALLBACK RULES:
- Fallback clothing is allowed only to complete an incomplete outfit.
- Fallback clothing must be plain black, minimal, fitted, neutral, and without logos.

Use these exact fallback rules:
- If TopImage is provided and BottomImage is missing:
  add simple plain black fitted pants.
- If BottomImage is provided and TopImage is missing:
  add simple plain black fitted t-shirt.
- If ShoesImage is missing:
  add simple plain black sneakers.
- If TopImage and BottomImage are both missing, and no DressImage or JumpsuitImage is provided:
  add simple plain black fitted t-shirt and simple plain black fitted pants.
- If DressImage is provided:
  do NOT add fallback top or fallback bottom.
  Only add simple plain black sneakers if ShoesImage is missing.
- If JumpsuitImage is provided:
  do NOT add fallback top or fallback bottom.
  Only add simple plain black sneakers if ShoesImage is missing.

STRICT PROHIBITIONS:
- Do NOT add jackets, coats, shirts, pants, skirts, dresses, bags, hats, jewelry, glasses, scarves, belts, or accessories unless they are provided or explicitly allowed as fallback.
- Do NOT add duplicate clothing.
- Do NOT add logos or branding.
- Do NOT change clothing colors.
- Do NOT change clothing patterns.
- Do NOT change clothing category.

FIT & REALISM:
- Clothing must align naturally with the body.
- Ensure correct scale, folds, perspective, shadows, and fabric behavior.
- Ensure realistic layering and contact with the body.
- Accessories must be realistic in scale and placement.

POSE & FRAMING:
- Full-body view from head to toe.
- Natural upright standing pose facing forward.
- Arms slightly away from the body.
- Center the person in the frame.
- Leave balanced empty space around the person.

BACKGROUND & LIGHTING:
- Background MUST be pure white or very close to pure white.
- Use a clean white studio background.
- No colored background.
- No gradient background.
- No textured background.
- No outdoor, room, closet, mirror, runway, store, or lifestyle environment.
- No props, no furniture, no extra objects.
- No text, no logos, no watermark.
- Soft even studio lighting.
- Only a minimal natural shadow under the feet is allowed.

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
      comments,

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
