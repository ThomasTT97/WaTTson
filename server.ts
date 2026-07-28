import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Secure Gemini API Endpoint
  app.post("/api/gemini", async (req, res) => {
    try {
      const { contents, config, model } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY environment variable is not configured." });
      }

      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      const response = await ai.models.generateContent({
        contents,
        config,
        model: model || "gemini-3.6-flash"
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Server Gemini Error:", error);
      res.status(500).json({ error: error.message || "An error occurred with Gemini execution." });
    }
  });

  // Intervals.icu CORS Proxy Endpoint
  app.use("/api/intervals", async (req, res) => {
    try {
      // Extract the target subpath (e.g. /api/v1/whoami)
      const subpath = req.path.replace(/^\//, "");
      const queryString = new URLSearchParams(req.query as any).toString();
      const targetUrl = `https://intervals.icu/api/${subpath}${queryString ? `?${queryString}` : ""}`;

      const headers: HeadersInit = {
        "Accept": "application/json",
      };

      if (req.headers["authorization"]) {
        headers["Authorization"] = req.headers["authorization"];
      }
      if (req.headers["content-type"]) {
        headers["Content-Type"] = req.headers["content-type"];
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (["POST", "PUT", "PATCH"].includes(req.method) && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const apiResponse = await fetch(targetUrl, fetchOptions);

      // Forward response headers that are safe to forward
      const safeHeaders = ["content-type", "cache-control"];
      for (const header of safeHeaders) {
        const val = apiResponse.headers.get(header);
        if (val) res.setHeader(header, val);
      }

      res.status(apiResponse.status);

      if (apiResponse.status === 204) {
        return res.end();
      }

      const contentType = apiResponse.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await apiResponse.json();
        res.json(data);
      } else {
        const text = await apiResponse.text();
        res.send(text);
      }
    } catch (error: any) {
      console.error("Intervals Proxy Error:", error);
      res.status(500).json({ error: error.message || "Intervals proxy failed." });
    }
  });

  // Vite middleware for development or Static Assets for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
