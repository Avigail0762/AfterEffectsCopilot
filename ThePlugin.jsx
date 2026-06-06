function createAetherSleekPanel(thisObj) {
    var myPanel = (thisObj instanceof Panel) ? thisObj : new Window("window", "AETHER PRO", undefined, { resizeable: true });

    // פלטת צבעים שקטה ונקייה
    var bgAppColor = [0.11, 0.11, 0.12, 1];
    var bgInputColor = [0.15, 0.15, 0.16, 1];
    var textPrimaryColor = [0.95, 0.95, 0.95, 1];
    var textMutedColor = [0.60, 0.60, 0.65, 1];
    var accentBlue = [0.20, 0.60, 1.00, 1];

    myPanel.graphics.backgroundColor = myPanel.graphics.newBrush(myPanel.graphics.BrushType.SOLID_COLOR, bgAppColor);
    myPanel.orientation = "column";
    myPanel.alignChildren = ["fill", "top"];
    myPanel.spacing = 20;
    myPanel.margins = 22;

    // --- Header ---
    var header = myPanel.add("group");
    header.orientation = "row";
    header.alignChildren = ["left", "center"];
    header.alignment = ["fill", "top"];
    header.spacing = 6;

    var titleMain = header.add("statictext", undefined, "A E T H E R");
    titleMain.graphics.font = ScriptUI.newFont("Helvetica", "BOLD", 16);
    titleMain.graphics.foregroundColor = myPanel.graphics.newPen(myPanel.graphics.PenType.SOLID_COLOR, textPrimaryColor, 1);

    var titlePro = header.add("statictext", undefined, "PRO");
    titlePro.graphics.font = ScriptUI.newFont("Helvetica", "BOLD", 10);
    titlePro.graphics.foregroundColor = myPanel.graphics.newPen(myPanel.graphics.PenType.SOLID_COLOR, accentBlue, 1);

    // קו הפרדה עדין
    var divider = myPanel.add("panel");
    divider.preferredSize.height = 1;
    divider.alignment = ["fill", "top"];

    // --- Status Area ---
    var statusGroup = myPanel.add("group");
    statusGroup.orientation = "column";
    statusGroup.alignChildren = ["center", "center"];
    statusGroup.alignment = ["fill", "top"];
    statusGroup.margins = [0, 15, 0, 15];
    statusGroup.spacing = 8;

    var statusIcon = statusGroup.add("statictext", undefined, "✨");
    statusIcon.graphics.font = ScriptUI.newFont("Helvetica", "REGULAR", 22);

    var statusText = statusGroup.add("statictext", undefined, "What would you like to create?");
    statusText.graphics.font = ScriptUI.newFont("Helvetica", "REGULAR", 14);
    statusText.graphics.foregroundColor = myPanel.graphics.newPen(myPanel.graphics.PenType.SOLID_COLOR, textMutedColor, 1);

    // --- Sleek Input Area ---
    var inputGroup = myPanel.add("group");
    inputGroup.orientation = "column";
    inputGroup.alignChildren = ["fill", "top"];
    inputGroup.alignment = ["fill", "top"];
    inputGroup.spacing = 15;

    var promptInput = inputGroup.add("edittext", undefined, "", { multiline: true, wantReturn: true, scrollable: false });
    promptInput.preferredSize.height = 80;
    promptInput.graphics.backgroundColor = myPanel.graphics.newBrush(myPanel.graphics.BrushType.SOLID_COLOR, bgInputColor);
    promptInput.graphics.foregroundColor = myPanel.graphics.newPen(myPanel.graphics.PenType.SOLID_COLOR, textPrimaryColor, 1);
    promptInput.graphics.font = ScriptUI.newFont("Helvetica", "REGULAR", 14);

    var executeBtn = inputGroup.add("button", undefined, "Generate Magic");
    executeBtn.preferredSize.height = 42;
    executeBtn.graphics.font = ScriptUI.newFont("Helvetica", "BOLD", 13);

    // --- Logic & Functions ---
    function gatherDeepContext() {
        var ctx = '{';
        var comp = app.project.activeItem;
        if (comp && comp instanceof CompItem) {
            ctx += '"hasActiveComp":true,';
            ctx += '"compName":"' + comp.name.replace(/"/g, '\\"') + '",';
            ctx += '"frameRate":' + comp.frameRate + ',';
            ctx += '"compWidth":' + comp.width + ',';
            ctx += '"compHeight":' + comp.height + ',';
            var selLayers = comp.selectedLayers;
            ctx += '"selectedLayers":[';
            for (var i = 0; i < selLayers.length; i++) {
                var l = selLayers[i];
                var lData = '{"index":' + l.index + ',"name":"' + l.name.replace(/"/g, '\\"') + '"';

                // 1. נתוני זמן (In, Out, Start)
                lData += ',"inPoint":' + l.inPoint + ',"outPoint":' + l.outPoint + ',"startTime":' + l.startTime;

                // 2. זיהוי סוג השכבה החכם
                var lType = "AVLayer";
                if (l instanceof TextLayer) lType = "TextLayer";
                else if (l instanceof ShapeLayer) lType = "ShapeLayer";
                else if (l instanceof CameraLayer) lType = "CameraLayer";
                else if (l instanceof LightLayer) lType = "LightLayer";
                if (l.nullLayer) lType = "NullLayer"; // דורס AVLayer רגיל אם זה Null

                lData += ',"type":"' + lType + '"';

                // 3. מידות וזמן מקור (לווידאו, תמונות וסולידים)
                if (l instanceof AVLayer) {
                    lData += ',"width":' + (l.width || 0) + ',"height":' + (l.height || 0);
                    if (l.source) {
                        lData += ',"duration":' + l.source.duration;
                    }
                }

                // 4. Transform values
                try {
                    var tGroup = l.property("ADBE Transform Group");
                    if (tGroup) {
                        var posVal = tGroup.property("ADBE Position").value;
                        lData += ',"position":[' + posVal[0] + ',' + posVal[1] + ']';
                        var sclVal = tGroup.property("ADBE Scale").value;
                        lData += ',"scale":[' + sclVal[0] + ',' + sclVal[1] + ']';
                        lData += ',"rotation":' + tGroup.property("ADBE Rotate Z").value;
                        lData += ',"opacity":' + tGroup.property("ADBE Opacity").value;
                    }
                } catch(e) {}

                // 5. Parent
                lData += ',"parentName":' + (l.parent ? '"' + l.parent.name.replace(/"/g, '\\"') + '"' : 'null');

                // 6. 3D
                lData += ',"is3DLayer":' + (l.threeDLayer ? 'true' : 'false');

                // 7. Effects list (up to 5)
                try {
                    var effectsStr = '[';
                    var numFx = l.Effects.numProperties;
                    for (var ei = 1; ei <= Math.min(numFx, 5); ei++) {
                        if (ei > 1) effectsStr += ',';
                        effectsStr += '"' + l.Effects.property(ei).name.replace(/"/g, '\\"') + '"';
                    }
                    effectsStr += ']';
                    lData += ',"effects":' + effectsStr;
                } catch(e) { lData += ',"effects":[]'; }

                lData += '}';
                ctx += lData;

                if (i < selLayers.length - 1) ctx += ',';
            } ctx += ']';
        } else { ctx += '"hasActiveComp":false'; }
        ctx += '}';
        return ctx;
    }

    function updateStatus(icon, text) {
        statusIcon.text = icon;
        statusText.text = text;
    }

    executeBtn.onClick = function () {
        if (promptInput.text === "") return;

        var userPrompt = promptInput.text;
        promptInput.text = "";

        var contextStr = gatherDeepContext();
        try {
            executeBtn.enabled = false;
            executeBtn.text = "Working...";
            updateStatus("⏳", "Thinking and generating...");
            app.activate();

            var returnedCode = askCopilot(userPrompt, contextStr);
            updateStatus("🛠️", "Applying changes...");

            try {
                eval(returnedCode);
                updateStatus("✅", "Done! What's next?");
            } catch (evalErr) {
                updateStatus("❌", "Oops, something went wrong.");
                alert("Execution Error:\n" + evalErr.message);
            }
        } catch (error) {
            updateStatus("🔌", "Connection error.");
        } finally {
            executeBtn.enabled = true;
            executeBtn.text = "Generate Magic";
        }
    };

    function askCopilot(prompt, contextStr) {
        // הקישור הרשמי והעובד שלך ב-Vercel (ודאי שהוא מסתיים ב- /api/copilot)
        var vercelUrl = "http://localhost:3000/api/copilot";;

        // מפתח המשתמשת
        var userId = "USER_AVIGAIL";

        // 1. ניקוי וקידוד הרמטי של הפרומפט כדי ששום עברית או מרכאות לא ישברו את ה-JSON
        var safePrompt = prompt.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n").replace(/\r/g, "");

        // 2. בניית ה-JSON בצורה קשיחה ומאובטחת
        var requestBody = '{' +
            '"prompt": "' + safePrompt + '",' +
            '"userId": "' + userId + '",' +
            '"context": ' + contextStr +
            '}';

        // 3. שמירה לקובץ זמני בפורמט UTF-8 כדי לתמוך בעברית בצורה מושלמת
        var tempFolder = Folder.temp;
        var tempFile = new File(tempFolder.fsName + "/aether_payload_" + new Date().getTime() + ".json");
        tempFile.open("w");
        tempFile.encoding = "UTF-8";
        tempFile.write(requestBody);
        tempFile.close();

        // 4. פקודת ה-cURL היציבה (עטופה במרכאות כפולות סביב הלינק והקובץ)
        var curlCommand = 'curl -s -X POST -H "Content-Type: application/json" -d @"' + tempFile.fsName + '" "' + vercelUrl + '"';

        // 5. שליחה לענן
        var responseStr = system.callSystem(curlCommand);
        tempFile.remove(); // מחיקה מיד של הקובץ הזמני

        // 6. קריאת התשובה מורסל
        try {
            var jsonStartIndex = responseStr.indexOf("{");
            if (jsonStartIndex !== -1) {
                var jsonResp = eval("(" + responseStr.substring(jsonStartIndex) + ")");
                if (jsonResp.code) return jsonResp.code;
                if (jsonResp.error) throw new Error(jsonResp.error);
            }
            throw new Error("Server returned invalid data.");
        } catch (e) {
            throw new Error("AETHER Error: " + responseStr);
        }
    }

    myPanel.layout.layout(true);
    if (myPanel instanceof Window) { myPanel.center(); myPanel.show(); }
}
createAetherSleekPanel(this);