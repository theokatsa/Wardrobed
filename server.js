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
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

async function imageUrlToBase64(url) {
  if (!url) return null;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${url}`);
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
    const {
      rowId,
      outfitName,
      topImage,
      bottomImage,
      shoesImage,
      outerwearImage,
      accessoriesImage,
      modelPhoto,
      ownerEmail,
    } = req.body;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Missing GEMINI_API_KEY",
      });
    }

    const images = await Promise.all([
      imageUrlToBase64(modelPhoto),
      imageUrlToBase64(topImage),
      imageUrlToBase64(bottomImage),
      imageUrlToBase64(shoesImage),
      imageUrlToBase64(outerwearImage),
      imageUrlToBase64(accessoriesImage),
    ]);

    const parts = [
      {
        text: `
Create a realistic full-body fashion try-on image.

Use the first image as the person's model photo.
Dress the person using the provided clothing item images:
top, bottom, shoes, outerwear, and accessories.

Keep the person's face, body proportions, pose, and background natural.
Make the outfit look realistic and wearable.
Do not add extra clothing items.
Return only the final generated image.
        `.trim(),
      },
      ...images.filter(Boolean).map((image) => ({
        inline_data: image,
      })),
    ];

    const geminiResponse = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts,
          },
        ],
      }),
    });

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      return res.status(geminiResponse.status).json({
        error: "Gemini API failed",
        details: geminiData,
      });
    }

    const imagePart = geminiData.candidates?.[0]?.content?.parts?.find(
      (part) => part.inline_data?.data
    );

    if (!imagePart) {
      return res.status(500).json({
        error: "No generated image returned",
        raw: geminiData,
      });
    }

    const generatedBase64 = imagePart.inline_data.data;
    const mimeType = imagePart.inline_data.mime_type || "image/png";

    const upload = await cloudinary.uploader.upload(
      `data:${mimeType};base64,${generatedBase64}`,
      {
        folder: "glide-outfits",
        public_id: rowId || undefined,
        overwrite: true,
      }
    );

    return res.json({
      rowId,
      outfitName,
      ownerEmail,
      imageUrl: upload.secure_url,
      outfitImage: upload.secure_url,
      status: "success",
    });
  }  catch (err) {
    console.error("GENERATE OUTFIT ERROR:", err);

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
