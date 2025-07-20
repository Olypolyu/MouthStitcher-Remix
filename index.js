const HandleBars = window.Handlebars;

const phonemes = ["CH", "S", "T", "E", "V", "I", "O", "B", "R", "U", "A", "G", "L", "SHUT"]
const replacements = new Map([
    ["A", "T"],
    ["E", "S"],
    ["U", "O"],
    ["R", "O"],
    ["V", "L"],
    ["I", "S"],
    ["B", "CH"],
    ["SHUT", "L"],
])

const fileListEl      = document.querySelector("#fileListSlot");
const fileNameEl      = document.querySelector("#fileNameInput");
const textureHeightEl = document.querySelector("#textureHeightInput");
const replacementMapEl = document.querySelector("#replacementMap");

const replacementMapModal = document.querySelector("#replacementMapModal");

const fileTemplate = HandleBars.compile(
    document.querySelector("#fileCardTemplate").innerHTML,
);

const toastTemplate = HandleBars.compile(
    document.querySelector("#toastTemplate").innerHTML
)

const replacementMapEntryTemplate = HandleBars.compile(
    document.querySelector("#replacementMapEntry").innerHTML
)

/** @type {Map<string, File>} */
const selectedFiles = new Map();

/** @type {URL[]} */
const currentObjUrls = [];

/**
 * @param {number} amount
 * @returns {string}
 */
function formatByteSize(amount) {
    const sizes = ["b", "KB", "MB", "GB", "TB"];
    let idx = 0;

    let a = amount;
    while (a >= 1024) {
        a /= 1024;
        idx++;
    }

    return `${a%1 == 0 ? a : a.toFixed(2)}${sizes[idx]}`;
}

/**
 * @param {File} file
 * @returns {String}
 */
function getPhoneme(file) {
    const match = file.name
        .split(".")[0]
        .match(/.*_(\w+)$/);

    if (!match) {
        throw new Error(
            "Invalid Name!",
            { cause: `"${file.name}" does not follow the naming guide. Please read the documentation for this tool.` }
        );
    }

    const phoneme = match[1].toUpperCase();
    if (!phonemes.includes(phoneme)) {
        throw new RangeError(
            "Invalid Phoneme!",
            { cause: `"${phoneme}" is not a valid phoneme. Please consult the documentation.` }
        );
    }

    return phoneme;
}

/**
 * @param {string} phoneme
 */
function removeFile(phoneme) {
    selectedFiles.delete(phoneme);
    updateFileList();
}

function clearFiles() {
    selectedFiles.clear();
    updateFileList();
}

function updateFileList() {
    // clear previous references...
    currentObjUrls.forEach(URL.revokeObjectURL);
    currentObjUrls.length = 0;

    const empty = selectedFiles.values().toArray().length < 1;

    document.querySelectorAll("#outputActionGroup button").forEach(
        el => el.disabled = empty
    );

    if (empty) {
        document.querySelector("#fileListEmpty").classList.remove("hidden")
        document.querySelector("#fileList").classList.add("hidden")
    }

    else {
        document.querySelector("#fileListEmpty").classList.add("hidden")
        document.querySelector("#fileList").classList.remove("hidden")

        let newInnerHTML = "";
        for (const [phoneme, file] of selectedFiles) {
            const url = URL.createObjectURL(file);
            currentObjUrls.push(url);
            newInnerHTML += fileTemplate({
                fileName: file.name,
                fileSize: formatByteSize(file.size),
                phoneme: phoneme,
                imgUrl: url,
            });
        }

        fileListEl.innerHTML = newInnerHTML;
    }
}

/** @returns {Promise<File[]?>} */
const askFiles = () =>
    new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;

        input.onchange = (e) => {
            if (e.target.files.length < 1) {
                resolve(null);
            }

            else {
                let files = [];
                for (const file of e.target.files) files.push(file);
                resolve(files);
            }
        };

        input.click();
    });


function showToast(header, body, type = "info", duration = 5000) {
    const ToastLevels = {
        info: "primary",
        warn: "warning",
        error: "danger",
    };

    if (!Object.keys(ToastLevels).includes(type)) throw new Error("Invalid Toast Type!");

    const el = document.createElement("div")
    el.innerHTML = toastTemplate({
        level:ToastLevels[type],
        body:body,
        header:header,
    })

    const toast = el.querySelector(".toast");
    const timeout_id = setTimeout(() => { toast.remove() }, duration);
    el.querySelector(".toast .btn-close")
        .addEventListener(
            "click",
            () => { clearTimeout(timeout_id); toast.remove(); }
        );

    document.querySelector("#toastList").appendChild(toast);
}

function drawReplacementMap() {
    /**
     * @returns {HTMLElement}
     * @param {string} phoneme
     * @param {number} column
     */
    function getPhonemeEl(phoneme, column) {
        return replacementMapEl.querySelector(`*[name="${column == 0 ? "replacement" : "replaced"}"] p[phoneme=${phoneme}] small`)
    }

    /** @param {DOMRect} rect */
    function center(rect) {
        return [
            rect.x + rect.width/2,
            rect.y + rect.height/2,
        ]
    }

    /** @type {HTMLElement} */
    const svg = document.querySelector("#replacementMapCanvas");
    const canvasRect = svg.getBoundingClientRect();

    function relativeToCanvas(x, y) {
        return [
            x - canvasRect.x,
            y - canvasRect.y,
        ]
    }

    svg.width = canvasRect.width;
    svg.height = canvasRect.height;

    function toggleBadge(value, el) {
        if (value) {
            el.classList.add("text-bg-primary")
            el.classList.remove("text-bg-light")
        }
        else {
            el.classList.remove("text-bg-primary")
            el.classList.add("text-bg-light")
        }
    }

    const selectedPhonemes = selectedFiles.keys().toArray()
    for (const phoneme of phonemes) {
        let value = selectedPhonemes.includes(phoneme);

        toggleBadge(value, getPhonemeEl(phoneme, 0));

        if (!value) {
            const replacement = replacements.get(phoneme);
            value = replacement && selectedPhonemes.includes(replacement);
        }

        toggleBadge(value, getPhonemeEl(phoneme, 1));
    }

    const strokeColor = getComputedStyle(document.body).getPropertyValue("--bs-primary");

    let resultingSVG = "";
    for (const [replaced, replacement] of replacements) {
        const fromEl = getPhonemeEl(replacement, 0);
        const toEl = getPhonemeEl(replaced, 1);

        const from = relativeToCanvas(...center(fromEl.getBoundingClientRect()));
        const to = relativeToCanvas(...center(toEl.getBoundingClientRect()));

        const lineCenter = [
            from[0] + (Math.abs(to[0]-from[0])/2),
            from[1] + (Math.abs(to[1]-from[1])/2),
        ]

        resultingSVG += `
            <path
                d="M ${from[0]} ${from[1]} C ${lineCenter[0] - 100} ${lineCenter[1] - 100}, ${lineCenter[0] + 25} ${lineCenter[1] + 25}, ${to[0]} ${to[1]}"
                stroke="white"
                stroke-width="6"
                fill="transparent" />
            <path
                d="M ${from[0]} ${from[1]} C ${lineCenter[0] - 100} ${lineCenter[1] - 100}, ${lineCenter[0] + 25} ${lineCenter[1] + 25}, ${to[0]} ${to[1]}"
                stroke="${strokeColor}"
                stroke-width="2"
                fill="transparent" />
        `
    }

    svg.innerHTML = resultingSVG;
}

/**
 * @param {File} file
 * @returns {File?}
 */
function validateFile(file) {
    try { getPhoneme(file) }
    catch (e) {
        showToast(e.message, e.cause, "error")
        return null;
    }

    const isValid = [ "png", "jpeg", "jpg", "webp" ].some(
        ext => file.name.toLowerCase().endsWith(ext)
    )

    if (!isValid) {
        showToast("Error!", `"${file.name}" does not have a supported image type!`, "error");
        return null;
    }

    return file
}

async function makeSheet() {
    const textHeight = textureHeightEl.value;
    const textWidth = textHeight * 14;

    const offscreen = new OffscreenCanvas(textWidth, textHeight);
    const ctx = offscreen.getContext("2d");

    for (let idx = 0; idx < phonemes.length; idx++) {
        const phoneme = phonemes[idx];
        const file = selectedFiles.get(phoneme) ?? selectedFiles.get(replacements.get(phoneme));
        if (!file) continue;

        const img = await window.createImageBitmap(file);
        if (img.height != textHeight) showToast(
            "Mistaching Resolution",
            `"${file.name}"'s resolution does not match ${textHeight}. This might be an issue.`,
            "warn",
            10000
        );

        ctx.drawImage(img, idx*textHeight, 0)
    }

    return offscreen.convertToBlob();
}

async function downloadImage(blob, fileName) {
    const url = URL.createObjectURL(blob);
    setTimeout(() => { URL.revokeObjectURL(url); }, 2000);

    const a = document.createElement("a")
    a.download = fileName;
    a.href = url;
    a.click();
}

async function actionDowloadFile() {
    const blob = await makeSheet();
    const fileName = fileNameEl.value.length ? fileNameEl.value : selectedFiles.values().toArray()[0].name.split("_")[0] + "_sheet";
    downloadImage(blob, fileName);
}

async function actionAddFiles() {
    for (const file of await askFiles()) {
        if (validateFile(file)) selectedFiles.set(getPhoneme(file), file)
    }
    updateFileList();
}

async function actionPreview() {
    const blob = await makeSheet();

    const url = URL.createObjectURL(blob);
    setTimeout(() => { URL.revokeObjectURL(url) }, 2000);

    window.open(url, "_blank");
}

function main() {
    window.addEventListener(
        "error",
        (event) => { showToast(event.message, event.error.message ?? event.error.stack, "error"); }
    );

    window.addEventListener(
        "unhandledrejection",
        (event) => { showToast(event.reason.type, event.reason, "error"); }
    );

    replacementMapModal.addEventListener("shown.bs.modal", drawReplacementMap);
    window.addEventListener(
        "resize",
        () => {
            if (replacementMapModal.classList.values().toArray().includes("show")) {
                drawReplacementMap();
            }
        }
    )

    const dragAreaEl = document.querySelector("#dragArea");
    dragAreaEl.addEventListener("dragover", e => e.preventDefault())
    dragAreaEl.addEventListener(
        "drop",
        e => {
            for (const file of e.dataTransfer.files) {
                if (validateFile(file)) selectedFiles.set(getPhoneme(file), file);
            }

            e.preventDefault();
            updateFileList();
        }
    );

    dragAreaEl.addEventListener(
        "dragenter", (e) => { dragAreaEl.classList.add("dragover"); }
    );
    dragAreaEl.addEventListener(
        "dragleave", (e) => { dragAreaEl.classList.remove("dragover"); }
    );
    dragAreaEl.addEventListener(
        "dragend", (e) => { dragAreaEl.classList.remove("dragover"); }
    );
    dragAreaEl.addEventListener(
        "drop", (e) => { dragAreaEl.classList.remove("dragover"); }
    );

    let phonemeListEl = phonemes.reduce(
        (acc, phoneme) => acc + replacementMapEntryTemplate({phoneme:phoneme}), ""
    );

    replacementMapEl.querySelector("*[name=\"replacement\"]").innerHTML = phonemeListEl;
    replacementMapEl.querySelector("*[name=\"replaced\"]").innerHTML = phonemeListEl;

    updateFileList();
}

main();
