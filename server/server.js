import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { OpenAI } from 'openai';
import cors from 'cors';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// ==========================================
// 1. PILOT MANAGEMENT SYSTEM
// ==========================================
const pilotUsers = {
    "USER_AVIGAIL": { name: "Avigail", used: 0, limit: 35 },
    "USER_MIRIAM": { name: "Miriam", used: 0, limit: 35 },
    "USER_ELISHEVA": { name: "Elisheva", used: 0, limit: 35 },
    "USER_CHAYA": { name: "Chaya", used: 0, limit: 35 }
};


// ==========================================
// 2. RAG KNOWLEDGE BASE
// ==========================================
const RAG_DATABASE = {

    property_access: `[RAG: TRANSFORM]
var t = layer.property("ADBE Transform Group");
t.property("ADBE Position").setValue([x, y]);    // [x,y,z] for 3D
t.property("ADBE Scale").setValue([100, 100]);   // percent
t.property("ADBE Rotate Z").setValue(45);
t.property("ADBE Opacity").setValue(100);
t.property("ADBE Anchor Point").setValue([0, 0]);
// Safe write:
var p = t.property("ADBE Position");
if (p.numKeys > 0) { p.setValueAtTime(comp.time, [x,y]); } else { p.setValue([x,y]); }`,

    keyframes: `[RAG: KEYFRAMES]
var op = layer.property("ADBE Transform Group").property("ADBE Opacity");
op.setValueAtTime(0, 0); op.setValueAtTime(1, 100);
var ease = new KeyframeEase(0.5, 33);
op.setTemporalEaseAtKey(1, [ease], [ease]);
// RULE: if prop has keys → setValueAtTime, else → setValue
if (prop.numKeys > 0) { prop.setValueAtTime(comp.time, val); } else { prop.setValue(val); }`,

    shapes: `[RAG: SHAPES — matchNames only, display names crash]
var sl = comp.layers.addShape();
var grp = sl.property("Contents").addProperty("ADBE Vector Group");
var gc  = grp.property("Contents");
// Ellipse: gc.addProperty("ADBE Vector Shape - Ellipse")
// Rect:    gc.addProperty("ADBE Vector Shape - Rect")
var fill = gc.addProperty("ADBE Vector Graphic - Fill");
if (fill) { fill.property("Color").setValue([1,0,0,1]); } // RGBA 0-1
var stroke = gc.addProperty("ADBE Vector Graphic - Stroke");
if (stroke) { stroke.property("Stroke Width").setValue(4); }
// Trim: add to gc (group contents), NEVER to path/fill/stroke
var trim = gc.addProperty("ADBE Vector Filter - Trim");`,

    text: `[RAG: TEXT]
var tl = comp.layers.addText("Hello");
var src = tl.property("Source Text");
var doc = src.value;         // get, then modify
doc.fontSize = 72;
doc.fillColor = [1,1,1];     // RGB 0-1, 3 elements NOT 4
doc.applyFill = true;
doc.justification = ParagraphJustification.CENTER_JUSTIFY;
src.setValue(doc);
tl.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width/2, comp.height/2]);`,

    masks: `[RAG: MASKS]
var myMask = layer.property("Masks").addProperty("Mask");
myMask.maskMode = MaskMode.ADD;
var shape = new Shape();
shape.vertices = [[-100,-50],[100,-50],[100,50],[-100,50]];
shape.closed = true;
myMask.property("maskShape").setValue(shape);
myMask.property("maskFeather").setValue([10,10]);`,

    effects: `[RAG: EFFECTS — internal matchNames only]
var blur = layer.Effects.addProperty("ADBE Gaussian Blur 2");
if (blur)   { blur.property("ADBE Gaussian Blur 2-0001").setValue(20); }
var shadow = layer.Effects.addProperty("ADBE Drop Shadow");
if (shadow) { shadow.property("ADBE Drop Shadow-0005").setValue(10); }
var huesat = layer.Effects.addProperty("ADBE Hue Saturation");
if (huesat) { huesat.property("ADBE Hue Saturation-0003").setValue(-50); }
var bc = layer.Effects.addProperty("ADBE Brightness & Contrast 2");
if (bc)     { bc.property("ADBE Brightness & Contrast 2-0001").setValue(30); }
var glow = layer.Effects.addProperty("ADBE Glow2");
if (glow)   { glow.property("ADBE Glow2-0002").setValue(0.5); }`,

    precomp_null: `[RAG: NULL / PARENT / PRECOMP]
var nl = comp.layers.addNull(); nl.name = "Ctrl";
// After addNull() re-fetch all layers by name — index shifts!
comp.layer("Child").parent = comp.layer("Ctrl");
// Precompose (sort indices descending):
var idx = []; for (var i=0;i<selLayers.length;i++){idx.push(selLayers[i].index);}
idx.sort(function(a,b){return b-a;});
comp.layers.precompose(idx, "Precomp", true);
var adj = comp.layers.addSolid([1,1,1],"Adj",comp.width,comp.height,comp.pixelAspect);
adj.adjustmentLayer = true;`,

    camera_3d: `[RAG: 3D / CAMERA / LIGHT]
layer.threeDLayer = true;
var cam = comp.layers.addCamera("Cam", [comp.width/2, comp.height/2]);
var lt  = comp.layers.addLight("Light", [comp.width/2, comp.height/2]);
lt.lightType = LightType.POINT;
lt.property("ADBE Light Options Group").property("ADBE Light Intensity").setValue(100);`,

    expressions_adv: `[RAG: EXPRESSIONS]
prop.expression = "wiggle(2,30)";
prop.expression = 'thisComp.layer("Other").transform.position';
prop.expression = "loopOut('cycle')";
prop.expression = ""; // clear`,

    adjustment_blend: `[RAG: BLEND MODES / ADJUSTMENT]
layer.blendingMode = BlendingMode.MULTIPLY; // SCREEN, OVERLAY, ADD, SOFT_LIGHT…
var adj = comp.layers.addSolid([1,1,1],"Adj",comp.width,comp.height,comp.pixelAspect);
adj.adjustmentLayer = true; adj.moveToBeginning();`
};
// ==========================
// 3. THE CORE SYSTEM PROMPT
// ==========================
const CORE_PROMPT = `You are an elite Adobe After Effects ExtendScript (ES3) automation expert.
Output ONLY a raw JSON object: {"code": "ExtendScript code here"}
No markdown, no explanation, no other text — just the JSON.

--- MANDATORY RULES (ALL MUST BE FOLLOWED — VIOLATIONS CAUSE CRASHES) ---

1. ES3 STRICT: Use ONLY 'var'. NO let/const, NO arrow functions (=>), NO template literals, NO optional chaining (?.). Pure ES3 JavaScript only.

2. MANDATORY IIFE WRAPPER:
   (function() {
       app.beginUndoGroup("Aether Magic");
       try {
           var comp = app.project.activeItem;
           if (!comp || !(comp instanceof CompItem)) { throw new Error("Please select a composition first."); }
           var selLayers = comp.selectedLayers;
           // If task needs selected layers: if (selLayers.length === 0) { throw new Error("Select a layer first."); }
           // YOUR LOGIC HERE
       } catch(e) {
           alert("Aether Error (Line " + e.line + "): " + e.message);
       } finally {
           app.endUndoGroup();
       }
   })();

3. DO NOT RE-CREATE CORE PROPERTIES: NEVER use .addProperty() on 'Transform', 'ADBE Transform Group', 'Material Options', or 'Audio'. AE creates these automatically. Only read/write their values.

4. EXPRESSIONS FIRST: If the user asks to link, match sizes, or dynamically track another layer, ALWAYS use expressions — never hardcode pixel calculations. Use sourceRectAtTime() for size matching.

5. 🔴 "The range has no values" — ROOT CAUSE: EMPTY COLLECTION ACCESS:
   In AE ExtendScript, comp.selectedLayers is a special collection object — NOT a plain JS array.
   Accessing comp.selectedLayers[0] when nothing is selected THROWS "The range has no values" instead of returning undefined.
   SAME for any PropertyGroup: accessing .property(1) when numProperties === 0 throws this error.
   ❌ WRONG: var layer = comp.selectedLayers[0]; // crashes if nothing is selected!
   ✅ CORRECT: if (comp.selectedLayers.length === 0) { throw new Error("Please select at least one layer."); }
               var layer = comp.selectedLayers[0]; // safe now
   SAME RULE for property groups: if (group.numProperties === 0) { throw new Error("..."); }
   ALWAYS guard ALL collection/array accesses with a length check before indexing.

6. 🔴 VOLATILE VARIABLES — ROOT CAUSE OF "Object is invalid":
   Any call to addShape(), addText(), addNull(), addSolid(), addCamera(), addLight(), moveToBeginning(), moveToEnd(), or any layer reorder IMMEDIATELY INVALIDATES all stored layer object references AND SHIFTS all layer indices.
   ❌ WRONG: var t = comp.selectedLayers[0]; comp.layers.addShape(); t.name = "X";
      (CRASHES — t is now an invalid reference!)
   ❌ ALSO WRONG: var tIdx = comp.selectedLayers[0].index; comp.layers.addShape(); comp.layer(tIdx).name = "X";
      (CRASHES — addShape() inserts at index 1, shifting all existing indices by +1!)
   ✅ CORRECT: var tName = comp.selectedLayers[0].name; comp.layers.addShape(); comp.layer(tName).name = "X";
      (SAFE — the name string is stable and unaffected by stack reordering.)
   RULE: Before ANY layer-adding call, save ALL needed layer names as strings. Re-fetch using comp.layer(nameString) afterwards.

7. 🔴 MATCHNAME ENFORCEMENT — ROOT CAUSE OF "Null is not an object":
   .addProperty() REQUIRES exact internal matchNames. English display names FAIL silently and return null.
   ❌ WRONG: grp.addProperty("Ellipse Path"); grp.addProperty("Fill");
   ✅ CORRECT: grp.addProperty("ADBE Vector Shape - Ellipse"); grp.addProperty("ADBE Vector Graphic - Fill");
   ALWAYS null-check before chaining: var fill = grp.addProperty("ADBE Vector Graphic - Fill"); if (fill) { fill.property("Color").setValue([1,0,0,1]); }

8. KEYFRAME SAFETY: NEVER call .setValue() on a property that already has keyframes.
   ALWAYS check: if (prop.numKeys > 0) { prop.setValueAtTime(comp.time, val); } else { prop.setValue(val); }

9. SHAPE MODIFIER RULE: "ADBE Vector Filter - Trim" and all modifiers MUST be added to an INDEXED_GROUP (shapeGroup.property("Contents")). NEVER add a modifier directly to a path, fill, or stroke property.

10. TRANSFORM PROPERTY ACCESS — Always use the full chain with these exact matchNames:
   layer.property("ADBE Transform Group").property("ADBE Position").setValue([x, y]);
   layer.property("ADBE Transform Group").property("ADBE Scale").setValue([100, 100]);
   layer.property("ADBE Transform Group").property("ADBE Rotate Z").setValue(45);
   layer.property("ADBE Transform Group").property("ADBE Opacity").setValue(100);
   layer.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
   For 3D layers: Position and Scale have 3 components [x, y, z].

11. EFFECTS ACCESS — Use matchNames, NEVER display names:
    var effect = layer.Effects.addProperty("ADBE Gaussian Blur 2"); // NOT "Gaussian Blur"
    Access sub-properties via their matchName (see injected RAG for exact names per effect).

12. SMART CONTEXT: Read the AE Context JSON. It provides layer types, current position/scale/rotation/opacity, parent name, 3D status, active effects, and comp frame rate. USE THIS DATA — never guess dimensions or positions.

--- Content Rules ---
- ALLOWED: shapes, text, nulls, cameras, lights, effects, expressions, keyframes, precomps, blend modes, masks, adjustments. For text layers: use ONLY the exact words the user provided — never invent or expand text.
- BLOCKED: Writing articles, stories, paragraphs, or any invented text content → return: {"code": "alert('I am an AE automation tool. I do not write content — type your text and I will place it in AE.');"}  
- BLOCKED: Any other non-AE task → return: {"code": "throw new Error('I am an After Effects automation tool only.');"}`;  

app.post('/api/copilot', async (req, res) => {
    try {
        const userPrompt = req.body.prompt;
        const aeContext = req.body.context;
        const userId = req.body.userId;

        if (!userId || !pilotUsers[userId]) {
            return res.json({ code: "alert('AETHER PRO: Invalid Pilot Key. Access Denied.');" });
        }
        if (pilotUsers[userId].used >= pilotUsers[userId].limit) {
            return res.json({ code: `alert('✨ AETHER PRO: You reached the ${pilotUsers[userId].limit} command limit. Thank you!');` });
        }
        if (!userPrompt) return res.status(400).json({ error: "Missing prompt" });

        // ==========================================
        // 4. DYNAMIC RAG INJECTION
        // ==========================================
        const lowerPrompt = userPrompt.toLowerCase();

        // property_access is ALWAYS injected — every operation reads or writes transform properties
        let injectedKnowledge = RAG_DATABASE.property_access;

        if (lowerPrompt.includes("keyframe") || lowerPrompt.includes("קיפריים") || lowerPrompt.includes("אנימציה") || lowerPrompt.includes("animate") || lowerPrompt.includes("motion") || lowerPrompt.includes("תנועה") || lowerPrompt.includes("opacity") || lowerPrompt.includes("שקיפות") || lowerPrompt.includes("ease") || lowerPrompt.includes("fade") || lowerPrompt.includes("scale") || lowerPrompt.includes("סקייל")) {
            injectedKnowledge += "\n\n" + RAG_DATABASE.keyframes;
        }
        if (lowerPrompt.includes("mask") || lowerPrompt.includes("מסכה") || lowerPrompt.includes("clip") || lowerPrompt.includes("קליפ")) {
            injectedKnowledge += "\n\n" + RAG_DATABASE.masks;
        }
        if (lowerPrompt.includes("shape") || lowerPrompt.includes("צורה") || lowerPrompt.includes("וקטור") || lowerPrompt.includes("ריבוע") || lowerPrompt.includes("עיגול") || lowerPrompt.includes("trim") || lowerPrompt.includes("חיתוך") || lowerPrompt.includes("circle") || lowerPrompt.includes("rect") || lowerPrompt.includes("star") || lowerPrompt.includes("כוכב") || lowerPrompt.includes("line") || lowerPrompt.includes("קו") || lowerPrompt.includes("stroke") || lowerPrompt.includes("fill") || lowerPrompt.includes("מילוי")) {
            injectedKnowledge += "\n\n" + RAG_DATABASE.shapes;
        }
        if (lowerPrompt.includes("text") || lowerPrompt.includes("טקסט") || lowerPrompt.includes("כותרת") || lowerPrompt.includes("פונט") || lowerPrompt.includes("font") || lowerPrompt.includes("title") || lowerPrompt.includes("subtitle") || lowerPrompt.includes("כיתוב") || lowerPrompt.includes("גופן")) {
            injectedKnowledge += "\n\n" + RAG_DATABASE.text;
        }
        if (lowerPrompt.includes("effect") || lowerPrompt.includes("blur") || lowerPrompt.includes("shadow") || lowerPrompt.includes("glow") || lowerPrompt.includes("brightness") || lowerPrompt.includes("tint") || lowerPrompt.includes("hue") || lowerPrompt.includes("color correct") || lowerPrompt.includes("contrast") || lowerPrompt.includes("saturate") || lowerPrompt.includes("אפקט") || lowerPrompt.includes("טשטוש") || lowerPrompt.includes("צל") || lowerPrompt.includes("זוהר") || lowerPrompt.includes("בהירות") || lowerPrompt.includes("גוון")) {
            injectedKnowledge += "\n\n" + RAG_DATABASE.effects;
        }
        if (lowerPrompt.includes("null") || lowerPrompt.includes("parent") || lowerPrompt.includes("precomp") || lowerPrompt.includes("rig") || lowerPrompt.includes("controller") || lowerPrompt.includes("solid") || lowerPrompt.includes("adjustment") || lowerPrompt.includes("ניל") || lowerPrompt.includes("הורה") || lowerPrompt.includes("פריקומפ") || lowerPrompt.includes("כוונון") || lowerPrompt.includes("רקע")) {
            injectedKnowledge += "\n\n" + RAG_DATABASE.precomp_null;
        }
        if (lowerPrompt.includes("3d") || lowerPrompt.includes("camera") || lowerPrompt.includes("light") || lowerPrompt.includes("depth") || lowerPrompt.includes("קמרה") || lowerPrompt.includes("מצלמה") || lowerPrompt.includes("תאורה") || lowerPrompt.includes("עומק") || lowerPrompt.includes("תלת")) {
            injectedKnowledge += "\n\n" + RAG_DATABASE.camera_3d;
        }
        if (lowerPrompt.includes("expression") || lowerPrompt.includes("link") || lowerPrompt.includes("wiggle") || lowerPrompt.includes("loop") || lowerPrompt.includes("dynamic") || lowerPrompt.includes("follow") || lowerPrompt.includes("connect") || lowerPrompt.includes("ביטוי") || lowerPrompt.includes("קישור") || lowerPrompt.includes("לולאה")) {
            injectedKnowledge += "\n\n" + RAG_DATABASE.expressions_adv;
        }
        if (lowerPrompt.includes("blend") || lowerPrompt.includes("blending") || lowerPrompt.includes("overlay") || lowerPrompt.includes("multiply") || lowerPrompt.includes("screen") || lowerPrompt.includes("background") || lowerPrompt.includes("מיזוג") || lowerPrompt.includes("רקע")) {
            injectedKnowledge += "\n\n" + RAG_DATABASE.adjustment_blend;
        }

        const fullPrompt = `Context from AE:\n${JSON.stringify(aeContext)}\n\nUser Request:\n${userPrompt}\n\n--- RELEVANT CODE PATTERNS ---\n${injectedKnowledge}`;

        console.log(`--> Request from ${pilotUsers[userId].name} (${pilotUsers[userId].used + 1}/${pilotUsers[userId].limit}).`);

        const response = await openai.chat.completions.create({
            model: "gpt-5.4",
            messages: [
                { role: "system", content: CORE_PROMPT },
                { role: "user", content: fullPrompt }
            ],
            temperature: 0
        });

        pilotUsers[userId].used++;

        let rawResponse = response.choices[0].message.content.trim();

        // Code Sanitizer
        if (rawResponse.startsWith("```")) {
            rawResponse = rawResponse.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
        }

        let parsedData;
        try {
            parsedData = JSON.parse(rawResponse);

            if (parsedData && typeof parsedData.code === 'string') {
                parsedData.code = parsedData.code
                    .replace(/^```(javascript|js|extendscript)?\n/i, "")
                    .replace(/```$/i, "")
                    .trim();
            }
        } catch (parseError) {
            console.error("Failed to parse JSON from AI:", rawResponse);
            return res.json({ code: `alert('AETHER PRO: The AI returned an invalid script format.');` });
        }

        console.log(`--> Action executed successfully for ${pilotUsers[userId].name}.`);
        res.json(parsedData);

    } catch (error) {
        console.error("SERVER ERROR:", error.message);
        res.json({ code: `alert('AETHER SERVER ERROR: ${error.message.replace(/'/g, "\\'")}');` });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`=================================`);
        console.log(`🚀 AETHER MASTER SERVER RUNNING `);
        console.log(`=================================`);
    });
}

export default app;