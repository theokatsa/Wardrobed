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

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);

  const contentType = res.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await res.arrayBuffer());

  return {
    mime_type: contentType,
    data: buffer.toString("base64"),
  };
}

app.post("/generate-outfit", async (req, res) => {
  try {
    const {
      rowId,
      outfitName,
      ownerEmail,
    } = req.body;

    // Simulate processing delay (optional)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Return dummy image URL
    return res.json({
      rowId,
      outfitName,
      ownerEmail,
      imageUrl: "https://via.placeholder.com/512x512.png?text=Outfit",
      status: "mock-success",
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
