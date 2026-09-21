---
name: kavan_theme
description: Strict guidelines for the premium, macOS-inspired dark aesthetic for the Kavan desktop app.
---

# Kavan Desktop App - Aesthetic & Theme Guidelines

Whenever you are building UI components or adjusting the layout for the Kavan desktop application, you **MUST** adhere to this strict design language. The goal is a mind-blowing, elegant, and uniquely rich experience that feels like a premium native desktop tool.

## Core Aesthetic Principles

1. **macOS-Inspired Dark Mode (Deep Black):** 
   The app should feel incredibly native. Do not use generic washed-out grays (like Tailwind's default `gray-800` or `gray-900`). The primary application background must be a deep, rich black (e.g., `#000000` or `#0A0A0A`). Panels and cards should be only slightly elevated (e.g., `#121212` or `#161618`).

2. **Sharp, Professional Geometry (NO "Cheap AI" Curves):** 
   Avoid overly curvy, bubbly border radii. Using massive borders (like `rounded-2xl` or `rounded-3xl` everywhere) makes the app look like a cheap AI-generated web mockup. 
   - **Do:** Use sharp, crisp, mathematical corners. Stick to `rounded` (4px) or `rounded-md` (6px). 
   - **Don't:** Use `rounded-full` unless it is explicitly for an avatar, a status dot, or a specific badge.

3. **Elegant Mixed Colors:** 
   Use subtle, rich accents to bring the app to life. Instead of flat, generic blues or reds, use elegant mixed tones or incredibly subtle gradients.
   - For destruction/termination: Deep, rich crimson.
   - For accents: macOS-like ocean blues or deep purples.
   - Avoid blinding neon colors that hurt the eyes in dark mode.

4. **Glassmorphism & Depth:** 
   Mimic native OS materials using translucency and background blurs (`backdrop-blur-md`). Separate panels not with heavy drop-shadows, but with incredibly fine, subtle borders (e.g., `border border-white/5` or `border-white/10`).

5. **High-Contrast, Modern Typography:** 
   Keep text extremely crisp. 
   - Primary text: `text-gray-100` (`#F3F4F6`)
   - Secondary text (muted): `text-gray-400` (`#9CA3AF`)
   - Font weights should be deliberate. Use `font-medium` for UI labels and `font-semibold` for headers.

## Tailwind V4 Implementation Cheatsheet
- **Main Background:** `bg-[#050505]` or `bg-black`
- **Panel Background:** `bg-[#111111] border border-white/10`
- **Buttons (Default):** `bg-white/5 hover:bg-white/10 text-white rounded-md transition-colors border border-white/10`
- **Buttons (Primary):** `bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors`
- **Hover Effects:** Always include a micro-interaction. E.g., `transition-all duration-200`.

## Final Rule
The design must look **expensive**. If the UI feels generic, simple, or bubbly, you have failed the aesthetic requirements. Every component must feel tactile and carefully crafted.
