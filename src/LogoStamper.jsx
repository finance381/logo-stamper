import { useState, useRef, useEffect, useCallback } from "react";
import JSZip from "jszip";

var SNAP_POSITIONS = [
  { label: "Top Left", key: "tl" },
  { label: "Top Centre", key: "tc" },
  { label: "Top Right", key: "tr" },
  { label: "Middle Left", key: "ml" },
  { label: "Middle Centre", key: "mc" },
  { label: "Middle Right", key: "mr" },
  { label: "Bottom Left", key: "bl" },
  { label: "Bottom Centre", key: "bc" },
  { label: "Bottom Right", key: "br" },
];

var FORMAT_OPTIONS = [
  { label: "PNG (Lossless)", value: "png" },
  { label: "JPEG (Smaller)", value: "jpeg" },
];

function DropZone({ onFile, accept, label, sublabel, active, preview }) {
  var [dragOver, setDragOver] = useState(false);
  var inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    var file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) onFile(file);
  }

  function handleChange(e) {
    var file = e.target.files[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={function (e) { e.preventDefault(); setDragOver(true); }}
      onDragLeave={function () { setDragOver(false); }}
      onDrop={handleDrop}
      onClick={function () { inputRef.current.click(); }}
      style={{
        border: dragOver ? "2px solid #6366f1" : active ? "2px solid #a5b4fc" : "2px dashed #d1d5db",
        borderRadius: 12,
        padding: active ? 0 : 32,
        cursor: "pointer",
        background: dragOver ? "#eef2ff" : active ? "#fafafa" : "#fff",
        transition: "all 0.15s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        minHeight: active ? "auto" : 120,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: "none" }}
      />
      {active && preview ? (
        <img src={preview} alt="preview" style={{ maxWidth: "100%", maxHeight: 160, objectFit: "contain", borderRadius: 10 }} />
      ) : (
        <>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{label}</span>
          <span style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{sublabel}</span>
        </>
      )}
    </div>
  );
}

function SnapButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 10px",
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 6,
        border: active ? "1.5px solid #6366f1" : "1.5px solid #e5e7eb",
        background: active ? "#eef2ff" : "#fff",
        color: active ? "#4338ca" : "#6b7280",
        cursor: "pointer",
        transition: "all 0.12s ease",
      }}
    >
      {label}
    </button>
  );
}

function SliderControl({ label, value, min, max, step, onChange, suffix }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", fontFamily: "'JetBrains Mono', monospace" }}>{value}{suffix || ""}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={function (e) { onChange(Number(e.target.value)); }}
        style={{ width: "100%", accentColor: "#6366f1" }}
      />
    </div>
  );
}

export default function LogoStamper() {
  var [baseImage, setBaseImage] = useState(null);
  var [basePreview, setBasePreview] = useState(null);
  var [baseName, setBaseName] = useState("");
  var [baseDims, setBaseDims] = useState(null);

  var [logoImage, setLogoImage] = useState(null);
  var [logoPreview, setLogoPreview] = useState(null);

  var [scale, setScale] = useState(15);
  var [opacity, setOpacity] = useState(100);
  var [padding, setPadding] = useState(20);
  var [snap, setSnap] = useState("br");
  var [format, setFormat] = useState("png");
  var [jpegQuality, setJpegQuality] = useState(95);
  var [presets, setPresets] = useState([]);
  var [presetLoading, setPresetLoading] = useState(true);
  var [logoPos, setLogoPos] = useState({ x: 0, y: 0 });
  var [dragging, setDragging] = useState(false);
  var [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  var [history, setHistory] = useState([]);
  var [batchMode, setBatchMode] = useState(false);
  var [batchFiles, setBatchFiles] = useState([]);
  var [batchPreviews, setBatchPreviews] = useState([]);
  var [batchProcessing, setBatchProcessing] = useState(false);
  var [batchProgress, setBatchProgress] = useState(0);
  useEffect(function () {
    fetch(import.meta.env.BASE_URL + 'logos/manifest.json')
      .then(function (r) { return r.json() })
      .then(function (data) { setPresets(data || []) })
      .catch(function () { setPresets([]) })
      .finally(function () { setPresetLoading(false) })
  }, []);

  function handlePresetClick(preset) {
    var url = import.meta.env.BASE_URL + 'logos/' + preset.file;
    var img = new Image();
    img.onload = function () {
      logoImgRef.current = img;
      setLogoImage(url);
      setLogoPreview(url);
    };
    img.onerror = function () {
      console.log('Failed to load preset: ' + preset.file);
    };
    img.src = url;
  }

  var canvasRef = useRef(null);
  var previewRef = useRef(null);
  var baseImgRef = useRef(null);
  var logoImgRef = useRef(null);
  function pushHistory() {
    setHistory(function (prev) {
      var snapshot = { x: logoPos.x, y: logoPos.y, scale: scale, opacity: opacity, padding: padding, snap: snap };
      var next = prev.concat([snapshot]);
      if (next.length > 30) next = next.slice(next.length - 30);
      return next;
    });
  }

  function handleUndo() {
    if (history.length === 0) return;
    var prev = history[history.length - 1];
    setHistory(function (h) { return h.slice(0, h.length - 1) });
    setScale(prev.scale);
    setOpacity(prev.opacity);
    setPadding(prev.padding);
    setSnap(prev.snap);
    setLogoPos({ x: prev.x, y: prev.y });
  }

  function handleBatchFiles(files) {
    var arr = Array.from(files).filter(function (f) { return f.type.startsWith("image/") });
    if (arr.length === 0) return;
    setBatchFiles(arr);
    setBatchPreviews(arr.map(function (f) { return URL.createObjectURL(f) }));
    // Load the first image as the base for positioning
    handleBaseFile(arr[0]);
  }

  function computeSnapForDims(imgW, imgH, logoW, logoH) {
    var pad = padding;
    var cx = (imgW - logoW) / 2;
    var cy = (imgH - logoH) / 2;
    var right = imgW - logoW - pad;
    var bottom = imgH - logoH - pad;
    var s = snap || "br";
    switch (s) {
      case "tl": return { x: pad, y: pad };
      case "tc": return { x: cx, y: pad };
      case "tr": return { x: right, y: pad };
      case "ml": return { x: pad, y: cy };
      case "mc": return { x: cx, y: cy };
      case "mr": return { x: right, y: cy };
      case "bl": return { x: pad, y: bottom };
      case "bc": return { x: cx, y: bottom };
      case "br": return { x: right, y: bottom };
      default: return { x: right, y: bottom };
    }
  }

  function handleBatchExport() {
    if (!logoImgRef.current || batchFiles.length === 0) return;
    setBatchProcessing(true);
    setBatchProgress(0);

    var total = batchFiles.length;
    var processed = 0;
    var mime = format === "png" ? "image/png" : "image/jpeg";
    var quality = format === "jpeg" ? jpegQuality / 100 : undefined;
    var ext = format === "png" ? ".png" : ".jpg";
    var concurrency = 2;
    var chunkSize = 20;

    function processOne(file) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          var offscreen = document.createElement("canvas");
          offscreen.width = img.naturalWidth;
          offscreen.height = img.naturalHeight;
          var ctx = offscreen.getContext("2d");
          ctx.drawImage(img, 0, 0);

          var targetW = img.naturalWidth * (scale / 100);
          var ratio = targetW / logoImgRef.current.naturalWidth;
          var lw = Math.round(targetW);
          var lh = Math.round(logoImgRef.current.naturalHeight * ratio);
          var pos = computeSnapForDims(img.naturalWidth, img.naturalHeight, lw, lh);

          ctx.globalAlpha = opacity / 100;
          ctx.drawImage(logoImgRef.current, pos.x, pos.y, lw, lh);
          ctx.globalAlpha = 1;

          offscreen.toBlob(function (blob) {
            var name = file.name.replace(/\.[^.]+$/, "") + "_logo" + ext;
            offscreen.width = 0;
            offscreen.height = 0;
            URL.revokeObjectURL(img.src);
            processed = processed + 1;
            setBatchProgress(Math.round((processed / total) * 100));
            resolve({ name: name, blob: blob });
          }, mime, quality);
        };
        img.src = URL.createObjectURL(file);
      });
    }

    function processChunk(files) {
      return new Promise(function (resolveChunk) {
        var results = [];
        var queue = files.slice();
        var active = 0;

        function next() {
          while (active < concurrency && queue.length > 0) {
            active = active + 1;
            var file = queue.shift();
            processOne(file).then(function (result) {
              results.push(result);
              active = active - 1;
              if (queue.length > 0) {
                next();
              } else if (active === 0) {
                resolveChunk(results);
              }
            });
          }
        }

        next();
      });
    }

    var chunks = [];
    for (var i = 0; i < batchFiles.length; i += chunkSize) {
      chunks.push(batchFiles.slice(i, i + chunkSize));
    }

    var chunkIndex = 0;

    function processNextChunk() {
      if (chunkIndex >= chunks.length) {
        setBatchProcessing(false);
        setBatchProgress(0);
        return;
      }

      var currentChunk = chunks[chunkIndex];
      var partLabel = chunks.length > 1 ? "_part" + (chunkIndex + 1) : "";

      processChunk(currentChunk).then(function (results) {
        var zip = new JSZip();
        results.forEach(function (r) {
          zip.file(r.name, r.blob, { compression: "STORE" });
        });

        zip.generateAsync({ type: "blob" }).then(function (zipBlob) {
          var link = document.createElement("a");
          link.href = URL.createObjectURL(zipBlob);
          link.download = "logo-stamped" + partLabel + "-" + Date.now() + ".zip";
          link.click();

          URL.revokeObjectURL(link.href);
          results.forEach(function (r) { r.blob = null; });
          results = null;
          zip = null;

          chunkIndex = chunkIndex + 1;
          setTimeout(processNextChunk, 500);
        });
      });
    }

    processNextChunk();
  }

  function handleBaseFile(file) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      baseImgRef.current = img;
      setBaseDims({ w: img.naturalWidth, h: img.naturalHeight });
      setBaseImage(url);
      setBasePreview(url);
      setBaseName(file.name.replace(/\.[^.]+$/, ""));
    };
    img.src = url;
  }

  function handleLogoFile(file) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      logoImgRef.current = img;
      setLogoImage(url);
      setLogoPreview(url);
    };
    img.src = url;
  }

  var getLogoDisplaySize = useCallback(function () {
    if (!baseDims || !logoImgRef.current) return { w: 0, h: 0 };
    var logoNatW = logoImgRef.current.naturalWidth;
    var logoNatH = logoImgRef.current.naturalHeight;
    var targetW = baseDims.w * (scale / 100);
    var ratio = targetW / logoNatW;
    return { w: Math.round(targetW), h: Math.round(logoNatH * ratio) };
  }, [baseDims, scale]);

  var computeSnapPos = useCallback(function (snapKey) {
    if (!baseDims) return { x: 0, y: 0 };
    var logo = getLogoDisplaySize();
    var pad = padding;
    var cx = (baseDims.w - logo.w) / 2;
    var cy = (baseDims.h - logo.h) / 2;
    var right = baseDims.w - logo.w - pad;
    var bottom = baseDims.h - logo.h - pad;
    switch (snapKey) {
      case "tl": return { x: pad, y: pad };
      case "tc": return { x: cx, y: pad };
      case "tr": return { x: right, y: pad };
      case "ml": return { x: pad, y: cy };
      case "mc": return { x: cx, y: cy };
      case "mr": return { x: right, y: cy };
      case "bl": return { x: pad, y: bottom };
      case "bc": return { x: cx, y: bottom };
      case "br": return { x: right, y: bottom };
      default: return { x: pad, y: pad };
    }
  }, [baseDims, getLogoDisplaySize, padding]);

  useEffect(function () {
    if (snap && baseDims && logoImgRef.current) {
      setLogoPos(computeSnapPos(snap));
    }
  }, [snap, scale, padding, baseDims, logoImage, computeSnapPos]);

  useEffect(function () {
    if (!baseImgRef.current || !previewRef.current) return;
    var canvas = previewRef.current;
    var ctx = canvas.getContext("2d");
    var base = baseImgRef.current;

    canvas.width = base.naturalWidth;
    canvas.height = base.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);

    if (logoImgRef.current) {
      var logo = getLogoDisplaySize();
      ctx.globalAlpha = opacity / 100;
      ctx.drawImage(logoImgRef.current, logoPos.x, logoPos.y, logo.w, logo.h);
      ctx.globalAlpha = 1;
    }
  }, [baseImage, logoImage, logoPos, scale, opacity, getLogoDisplaySize]);

  function getPreviewScale() {
    if (!baseDims || !previewRef.current) return 1;
    var container = previewRef.current.parentElement;
    if (!container) return 1;
    var maxW = container.clientWidth;
    var maxH = container.clientHeight || 560;
    var scaleX = maxW / baseDims.w;
    var scaleY = maxH / baseDims.h;
    return Math.min(scaleX, scaleY, 1);
  }

  function handlePreviewMouseDown(e) {
    if (!logoImgRef.current || !baseDims) return;
    var canvas = previewRef.current;
    var rect = canvas.getBoundingClientRect();
    var pScale = getPreviewScale();
    var mx = (e.clientX - rect.left) / pScale;
    var my = (e.clientY - rect.top) / pScale;
    var logo = getLogoDisplaySize();

    if (mx >= logoPos.x && mx <= logoPos.x + logo.w && my >= logoPos.y && my <= logoPos.y + logo.h) {
      setDragging(true);
      setSnap(null);
      setDragOffset({ x: mx - logoPos.x, y: my - logoPos.y });
      e.preventDefault();
    }
  }

  function handlePreviewMouseMove(e) {
    if (!dragging || !baseDims) return;
    var canvas = previewRef.current;
    var rect = canvas.getBoundingClientRect();
    var pScale = getPreviewScale();
    var mx = (e.clientX - rect.left) / pScale;
    var my = (e.clientY - rect.top) / pScale;
    var logo = getLogoDisplaySize();
    var newX = Math.max(0, Math.min(baseDims.w - logo.w, mx - dragOffset.x));
    var newY = Math.max(0, Math.min(baseDims.h - logo.h, my - dragOffset.y));
    setLogoPos({ x: newX, y: newY });
  }

  function handlePreviewMouseUp() {
    if (dragging) pushHistory();
    setDragging(false);
  }

  function handleExport() {
    if (!baseImgRef.current) return;
    var offscreen = document.createElement("canvas");
    offscreen.width = baseDims.w;
    offscreen.height = baseDims.h;
    var ctx = offscreen.getContext("2d");
    ctx.drawImage(baseImgRef.current, 0, 0);

    if (logoImgRef.current) {
      var logo = getLogoDisplaySize();
      ctx.globalAlpha = opacity / 100;
      ctx.drawImage(logoImgRef.current, logoPos.x, logoPos.y, logo.w, logo.h);
      ctx.globalAlpha = 1;
    }

    var mime = format === "png" ? "image/png" : "image/jpeg";
    var quality = format === "jpeg" ? jpegQuality / 100 : undefined;
    var ext = format === "png" ? ".png" : ".jpg";

    offscreen.toBlob(function (blob) {
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = baseName + "_logo" + ext;
      link.click();
      URL.revokeObjectURL(link.href);
    }, mime, quality);
  }

  function handleReset() {
    setBaseImage(null);
    setBasePreview(null);
    setBaseName("");
    setBaseDims(null);
    setLogoImage(null);
    setLogoPreview(null);
    setScale(15);
    setOpacity(100);
    setPadding(20);
    setSnap("br");
    setFormat("png");
    setJpegQuality(95);
    setLogoPos({ x: 0, y: 0 });
    baseImgRef.current = null;
    logoImgRef.current = null;
  }

  var ready = baseImage && logoImage;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8f8f7",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      display: "flex",
      flexDirection: "column",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        padding: "14px 24px",
        borderBottom: "1px solid #e5e5e4",
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "linear-gradient(135deg, #6366f1, #4f46e5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 14,
          }}>L</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>Logo Stamper</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#6366f1", background: "#eef2ff", padding: "2px 7px", borderRadius: 4, marginLeft: 2 }}>SMO</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Mode toggle */}
          <div style={{
            display: "flex", borderRadius: 6, overflow: "hidden",
            border: "1.5px solid #e5e7eb",
          }}>
            <button onClick={function () { setBatchMode(false) }} style={{
              fontSize: 11, fontWeight: 600, padding: "4px 12px", cursor: "pointer",
              border: "none",
              background: !batchMode ? "#4f46e5" : "#fff",
              color: !batchMode ? "#fff" : "#6b7280",
            }}>Single</button>
            <button onClick={function () { setBatchMode(true) }} style={{
              fontSize: 11, fontWeight: 600, padding: "4px 12px", cursor: "pointer",
              border: "none",
              background: batchMode ? "#4f46e5" : "#fff",
              color: batchMode ? "#fff" : "#6b7280",
            }}>Batch</button>
          </div>
          {ready && history.length > 0 && (
            <button onClick={handleUndo} style={{
              fontSize: 11, fontWeight: 600, color: "#6366f1", background: "#eef2ff",
              border: "1.5px solid #c7d2fe", borderRadius: 6, padding: "4px 12px",
              cursor: "pointer",
            }}>Undo ({history.length})</button>
          )}
          {ready && (
            <button onClick={handleReset} style={{
              fontSize: 11, fontWeight: 600, color: "#ef4444", background: "none",
              border: "1.5px solid #fecaca", borderRadius: 6, padding: "4px 12px",
              cursor: "pointer",
            }}>Reset All</button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{
          width: 280, minWidth: 280, borderRight: "1px solid #e5e5e4", background: "#fff",
          padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16,
        }}>
          {/* Upload: Base Image */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              {batchMode ? "Base Images" : "Base Image"}
            </div>
            {batchMode ? (
              <>
                <div
                  onClick={function () {
                    var inp = document.createElement("input");
                    inp.type = "file";
                    inp.accept = "image/png,image/jpeg,image/webp";
                    inp.multiple = true;
                    inp.onchange = function () { handleBatchFiles(inp.files) };
                    inp.click();
                  }}
                  onDragOver={function (e) { e.preventDefault() }}
                  onDrop={function (e) {
                    e.preventDefault();
                    handleBatchFiles(e.dataTransfer.files);
                  }}
                  style={{
                    border: batchFiles.length > 0 ? "2px solid #a5b4fc" : "2px dashed #d1d5db",
                    borderRadius: 12, padding: batchFiles.length > 0 ? 10 : 32,
                    cursor: "pointer", background: "#fff", textAlign: "center",
                  }}
                >
                  {batchFiles.length > 0 ? (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#4338ca" }}>{batchFiles.length} images loaded</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8, justifyContent: "center" }}>
                        {batchPreviews.slice(0, 12).map(function (p, i) {
                          return <img key={i} src={p} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, border: "1px solid #e5e7eb" }} />;
                        })}
                        {batchFiles.length > 12 && (
                          <div style={{ width: 40, height: 40, borderRadius: 4, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#9ca3af" }}>
                            +{batchFiles.length - 12}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6 }}>Click to re-select</div>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Drop multiple images</span>
                      <br />
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>PNG, JPEG, WebP</span>
                    </>
                  )}
                </div>
              </>
            ) : (
              <DropZone
                onFile={handleBaseFile}
                accept="image/png,image/jpeg,image/webp"
                label="Drop image here"
                sublabel="PNG, JPEG, WebP"
                active={!!baseImage}
                preview={basePreview}
              />
            )}
            {baseDims && (
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                {batchMode ? "Preview: " : ""}{baseDims.w} × {baseDims.h}px
              </div>
            )}
          </div>

          {/* Upload: Logo */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Logo</div>
            <DropZone
              onFile={handleLogoFile}
              accept="image/png"
              label="Drop logo PNG"
              sublabel="Transparent PNG recommended"
              active={!!logoImage}
              preview={logoPreview}
            />
          </div>

          {/* Preset Logos */}
          {!presetLoading && presets.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Preset Logos</div>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6,
                maxHeight: 240, overflowY: "auto",
              }}>
                {presets.map(function (p, i) {
                  var isActive = logoImage === (import.meta.env.BASE_URL + 'logos/' + p.file);
                  return (
                    <div
                      key={p.file + '-' + i}
                      onClick={function () { handlePresetClick(p) }}
                      title={p.name}
                      style={{
                        border: isActive ? "2px solid #6366f1" : "2px solid #e5e7eb",
                        borderRadius: 8,
                        padding: 6,
                        cursor: "pointer",
                        background: isActive ? "#eef2ff" : "#fff",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        transition: "all 0.12s ease",
                      }}
                    >
                      <img
                        src={import.meta.env.BASE_URL + 'logos/' + p.file}
                        alt={p.name}
                        style={{
                          width: 56, height: 56, objectFit: "contain",
                          background: "repeating-conic-gradient(#f3f3f2 0% 25%, #fff 0% 50%) 50% / 12px 12px",
                          borderRadius: 4,
                        }}
                      />
                      <span style={{
                        fontSize: 9, fontWeight: 600, color: isActive ? "#4338ca" : "#9ca3af",
                        textAlign: "center", lineHeight: 1.2,
                        overflow: "hidden", textOverflow: "ellipsis",
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        width: "100%",
                      }}>{p.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {ready && (
            <>
              {/* Divider */}
              <div style={{ borderTop: "1px solid #f3f3f2" }} />

              {/* Controls */}
              <SliderControl label="Logo Scale" value={scale} min={3} max={50} step={1} onChange={setScale} suffix="%" />
              <SliderControl label="Opacity" value={opacity} min={10} max={100} step={1} onChange={setOpacity} suffix="%" />
              <SliderControl label="Edge Padding" value={padding} min={0} max={200} step={5} onChange={setPadding} suffix="px" />

              {/* Snap */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Quick Position</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {SNAP_POSITIONS.map(function (s) {
                    return <SnapButton key={s.key} label={s.label} active={snap === s.key} onClick={function () { pushHistory(); setSnap(s.key); }} />;
                  })}
                </div>
                <div style={{ fontSize: 10, color: "#b0b0b0", marginTop: 5 }}>Or drag the logo on the canvas</div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: "1px solid #f3f3f2" }} />

              {/* Export */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Export Format</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {FORMAT_OPTIONS.map(function (f) {
                    return (
                      <button
                        key={f.value}
                        onClick={function () { setFormat(f.value); }}
                        style={{
                          flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 600,
                          borderRadius: 6, cursor: "pointer", transition: "all 0.12s",
                          border: format === f.value ? "1.5px solid #6366f1" : "1.5px solid #e5e7eb",
                          background: format === f.value ? "#eef2ff" : "#fff",
                          color: format === f.value ? "#4338ca" : "#6b7280",
                        }}
                      >{f.label}</button>
                    );
                  })}
                </div>
                {format === "jpeg" && (
                  <div style={{ marginTop: 10 }}>
                    <SliderControl label="JPEG Quality" value={jpegQuality} min={70} max={100} step={1} onChange={setJpegQuality} suffix="%" />
                  </div>
                )}
              </div>

              {batchMode && batchFiles.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  <button
                    onClick={handleBatchExport}
                    disabled={batchProcessing}
                    style={{
                      width: "100%", padding: "10px 0", fontSize: 13, fontWeight: 700,
                      background: batchProcessing ? "#a5b4fc" : "linear-gradient(135deg, #6366f1, #4f46e5)",
                      color: "#fff", border: "none", borderRadius: 8,
                      cursor: batchProcessing ? "not-allowed" : "pointer",
                      transition: "opacity 0.15s",
                    }}
                  >
                    {batchProcessing ? "Processing... " + batchProgress + "%" : "Stamp All & Download ZIP (" + batchFiles.length + ")"}
                  </button>
                  {batchProcessing && (
                    <div style={{ height: 4, borderRadius: 2, background: "#e5e7eb", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: batchProgress + "%", background: "#6366f1", transition: "width 0.2s" }} />
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={handleExport} style={{
                  width: "100%", padding: "10px 0", fontSize: 13, fontWeight: 700,
                  background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "#fff",
                  border: "none", borderRadius: 8, cursor: "pointer",
                  transition: "opacity 0.15s", marginTop: 4,
                }}>
                  Download Image
                </button>
              )}
            </>
          )}
        </div>

        {/* Canvas Area */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24, overflow: "auto", background: "#f0f0ee",
        }}>
          {!baseImage ? (
            <div style={{ textAlign: "center", color: "#b0b0b0" }}>
              <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.4 }}>🖼️</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Upload a base image to get started</div>
            </div>
          ) : (
            <div
              style={{ position: "relative", lineHeight: 0 }}
              onMouseMove={handlePreviewMouseMove}
              onMouseUp={handlePreviewMouseUp}
              onMouseLeave={handlePreviewMouseUp}
            >
              <canvas
                ref={previewRef}
                onMouseDown={handlePreviewMouseDown}
                style={{
                  maxWidth: "100%",
                  maxHeight: "calc(100vh - 120px)",
                  objectFit: "contain",
                  borderRadius: 6,
                  boxShadow: "0 2px 20px rgba(0,0,0,0.10)",
                  cursor: dragging ? "grabbing" : (logoImage ? "grab" : "default"),
                  display: "block",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
