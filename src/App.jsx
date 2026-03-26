import { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from "recharts";
import { BarcodeDetector as BarcodeDetectorPolyfill } from "barcode-detector";

const STORAGE_KEY = "fitness_logs_v3";
const BODY_PARTS = ["胸", "背中", "脚", "肩", "腕", "腹", "全身"];
const CUSTOM_EX_KEY = 'custom_exercises';
const FOOD_DB_KEY = 'food_database_v1';
const COPIED_MEAL_KEY = 'copied_meal_v1';

// window.storage (Cowork) が使えない場合は localStorage にフォールバック
const appStorage = {
  get: async (key) => {
    try {
      if (window.storage) { const r = await window.storage.get(key); return r ? r.value : null; }
    } catch {}
    try { return localStorage.getItem(key); } catch {}
    return null;
  },
  set: async (key, value) => {
    try {
      if (window.storage) { await window.storage.set(key, value); return; }
    } catch {}
    try { localStorage.setItem(key, value); } catch {}
  },
};
const PRESET_EXERCISES = {
  胸:  ['ベンチプレス','インクラインベンチプレス','ダンベルフライ','ケーブルクロスオーバー','ディップス'],
  背中: ['デッドリフト','懸垂','ラットプルダウン','シーテッドロウ','ワンハンドロウ','Tバーロウ'],
  脚:  ['スクワット','レッグプレス','レッグカール','レッグエクステンション','ルーマニアンデッドリフト','カーフレイズ'],
  肩:  ['ショルダープレス','サイドレイズ','フロントレイズ','リアレイズ','アーノルドプレス'],
  腕:  ['バーベルカール','ダンベルカール','ハンマーカール','トライセプスプッシュダウン','スカルクラッシャー','フレンチプレス'],
  腹:  ['クランチ','レッグレイズ','プランク','アブホイール','ロシアンツイスト'],
  全身: ['バーピー','ケトルベルスイング','クリーン＆ジャーク','ファーマーズウォーク'],
};

const ls = { fontSize: 12, color: "#666", marginBottom: 6 }; // labelStyle

// 1RM = 重量 × 回数 ÷ 40 + 重量
const calc1RM = (weight, reps) => {
  const w = parseFloat(weight), r = parseFloat(reps);
  if (!w || !r || r < 1) return "";
  return Math.round(w * r / 40 + w).toString();
};

const defaultLog = () => ({
  id: Date.now(),
  date: new Date().toISOString().split("T")[0],
  weight: "", temp: "", meals: [], training: [], note: "",
});
const defaultSet = () => ({ weight: "", reps: "", orm: "", bodyweight: false, side: "両側" });
const calcTotals = (meals) => ({
  calories: meals.reduce((s, m) => s + (parseFloat(m.calories) || 0), 0),
  protein:  meals.reduce((s, m) => s + (parseFloat(m.protein)  || 0), 0),
  fat:      meals.reduce((s, m) => s + (parseFloat(m.fat)      || 0), 0),
  carbs:    meals.reduce((s, m) => s + (parseFloat(m.carbs)    || 0), 0),
});
const calcExVol = (sets) =>
  sets.reduce((s, set) => s + (parseFloat(set.weight)||0)*(parseFloat(set.reps)||0), 0);

// ── Exercise Picker Modal ─────────────────────────────────────────
function ExercisePicker({ onSelect, onClose, customExercises, onAddCustom, logs }) {
  const [selectedPart, setSelectedPart] = useState('胸');
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [manualName, setManualName] = useState('');
  const [mode, setMode] = useState('select'); // 'select' | 'manual'

  const allForPart = [...(PRESET_EXERCISES[selectedPart] || []), ...(customExercises[selectedPart] || [])];

  // 種目名から直近の記録を取得
  const getLastRecord = (name) => {
    for (const log of (logs || [])) {
      const ex = (log.training || []).find(e => e.name === name);
      if (ex && ex.sets && ex.sets.length > 0) {
        return { date: log.date, sets: ex.sets };
      }
    }
    return null;
  };

  const handleAddCustom = () => {
    if (!newName.trim()) return;
    onAddCustom(selectedPart, newName.trim());
    setNewName('');
    setAddingNew(false);
  };

  const handleManual = () => {
    if (!manualName.trim()) return;
    onSelect({ name: manualName.trim(), bodyPart: selectedPart });
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:1000, display:'flex', alignItems:'flex-end' }}>
      <div style={{ width:'100%', background:'#0f1015', borderRadius:'18px 18px 0 0', padding:'20px 20px 40px', border:'1px solid #1c1c24', maxHeight:'88vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontFamily:"'DM Mono',monospace", color:'#c8f080', fontSize:14 }}>種目を選択</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#555', fontSize:22, cursor:'pointer' }}>×</button>
        </div>

        {/* Mode switch */}
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[['select','リストから選ぶ'],['manual','手入力']].map(([m,l]) => (
            <button key={m} onClick={()=>setMode(m)}
              style={{ background: mode===m ? '#1a2a1a' : 'none', border: mode===m ? '1px solid #c8f080' : '1px solid #222', borderRadius:20, padding:'5px 14px', fontSize:12, color: mode===m ? '#c8f080' : '#555', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>
              {l}
            </button>
          ))}
        </div>

        {mode === 'select' && (
          <>
            {/* Body part tabs */}
            <div style={{ display:'flex', gap:6, overflowX:'auto', marginBottom:16, paddingBottom:4 }}>
              {BODY_PARTS.map(p => (
                <button key={p} onClick={()=>setSelectedPart(p)}
                  style={{ background: selectedPart===p ? '#1a1f2e' : 'none', border: selectedPart===p ? '1px solid #7090c8' : '1px solid #222', borderRadius:20, padding:'5px 14px', fontSize:12, color: selectedPart===p ? '#7090c8' : '#555', cursor:'pointer', whiteSpace:'nowrap', fontFamily:"'DM Mono',monospace" }}>
                  {p}
                </button>
              ))}
            </div>

            {/* Exercise list */}
            <div style={{ marginBottom:12 }}>
              {allForPart.map((name, i) => {
                const isCustom = i >= (PRESET_EXERCISES[selectedPart]||[]).length;
                const last = getLastRecord(name);
                return (
                  <div key={name} onClick={()=>{ onSelect({ name, bodyPart: selectedPart }); onClose(); }}
                    style={{ padding:'12px 14px', background:'#111318', borderRadius:8, marginBottom:6, cursor:'pointer', border:'1px solid #1c1c24' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: last ? 6 : 0 }}>
                      <span style={{ fontSize:14 }}>{name}</span>
                      {isCustom && <span style={{ fontSize:10, color:'#7090c8', fontFamily:"'DM Mono',monospace" }}>カスタム</span>}
                    </div>
                    {last && (
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <span style={{ fontSize:10, color:'#444', fontFamily:"'DM Mono',monospace" }}>{last.date.slice(5)}</span>
                        {last.sets.map((s,si) => (
                          <span key={si} style={{ fontSize:11, fontFamily:"'DM Mono',monospace", background:'#0a0a0f', borderRadius:4, padding:'2px 6px' }}>
                            <span style={{ color:'#555' }}>S{si+1} </span>
                            {s.bodyweight ? <span style={{ color:'#888' }}>自重</span> : <span style={{ color:'#ccc' }}>{s.weight}kg</span>}
                            <span style={{ color:'#888' }}>×{s.reps}</span>
                            {!s.bodyweight && s.orm && <span style={{ color:'#c8f080' }}> 1RM:{s.orm}kg</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add custom */}
            {addingNew ? (
              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <input className="fi" placeholder="種目名を入力" value={newName} onChange={e=>setNewName(e.target.value)} style={{ flex:1 }} autoFocus />
                <button onClick={handleAddCustom} style={{ background:'#1a2a1a', border:'1px solid #2a5030', color:'#80c880', borderRadius:6, padding:'8px 14px', fontSize:12, cursor:'pointer' }}>追加</button>
                <button onClick={()=>setAddingNew(false)} style={{ background:'none', border:'1px solid #222', color:'#555', borderRadius:6, padding:'8px 12px', fontSize:12, cursor:'pointer' }}>×</button>
              </div>
            ) : (
              <button onClick={()=>setAddingNew(true)}
                style={{ width:'100%', background:'none', border:'1px dashed #2a3050', borderRadius:8, padding:12, color:'#6080a8', fontSize:13, cursor:'pointer' }}>
                ＋ この部位に種目を追加
              </button>
            )}
          </>
        )}

        {mode === 'manual' && (
          <div>
            <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>部位</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
              {BODY_PARTS.map(p => (
                <button key={p} onClick={()=>setSelectedPart(p)}
                  style={{ background: selectedPart===p ? '#1a1f2e' : 'none', border: selectedPart===p ? '1px solid #7090c8' : '1px solid #222', borderRadius:20, padding:'5px 12px', fontSize:12, color: selectedPart===p ? '#7090c8' : '#555', cursor:'pointer', fontFamily:"'DM Mono',monospace" }}>
                  {p}
                </button>
              ))}
            </div>
            <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>種目名</div>
            <input className="fi" placeholder="種目名を直接入力" value={manualName} onChange={e=>setManualName(e.target.value)} style={{ marginBottom:14 }} autoFocus />
            <button onClick={handleManual} className="save-btn">この種目を選択</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Barcode Scanner ────────────────────────────────────────────────
function BarcodeModal({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const [status, setStatus] = useState("カメラ起動中...");

  useEffect(() => {
    const DetectorClass = ("BarcodeDetector" in window) ? window.BarcodeDetector : BarcodeDetectorPolyfill;
    detectorRef.current = new DetectorClass({ formats: ["ean_13","ean_8","upc_a","upc_e","code_128","code_39"] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); setStatus("バーコードをカメラに向けてください"); loop(); }
      }).catch(() => setStatus("カメラへのアクセスが拒否されました"));
    return () => { streamRef.current?.getTracks().forEach(t=>t.stop()); if(rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const loop = () => {
    const fn = async () => {
      try {
        const bc = await detectorRef.current?.detect(videoRef.current);
        if (bc?.length) { streamRef.current?.getTracks().forEach(t=>t.stop()); onDetected(bc[0].rawValue); return; }
      } catch {}
      rafRef.current = requestAnimationFrame(fn);
    };
    rafRef.current = requestAnimationFrame(fn);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.95)", zIndex:1100, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:20 }}>
      <style>{`@keyframes scan{0%,100%{transform:translateY(-150%)}50%{transform:translateY(150%)}}`}</style>
      <div style={{ width:"100%", maxWidth:400 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontFamily:"'DM Mono',monospace", color:"#c8f080", fontSize:14 }}>バーコードスキャン</div>
          <button onClick={onClose} style={{ background:"none", border:"1px solid #333", color:"#888", borderRadius:6, padding:"4px 14px", cursor:"pointer" }}>閉じる</button>
        </div>
        <div style={{ position:"relative", background:"#000", borderRadius:14, overflow:"hidden", aspectRatio:"4/3" }}>
          <video ref={videoRef} style={{ width:"100%", height:"100%", objectFit:"cover" }} muted playsInline />
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
            <div style={{ width:"72%", height:"28%", border:"2px solid #c8f080", borderRadius:8, boxShadow:"0 0 0 9999px rgba(0,0,0,0.45)", overflow:"hidden" }}>
              <div style={{ height:2, background:"linear-gradient(90deg,transparent,#c8f080,transparent)", animation:"scan 1.8s ease-in-out infinite", marginTop:"50%" }} />
            </div>
          </div>
        </div>
        <div style={{ marginTop:12, fontSize:12, color:"#666", textAlign:"center" }}>{status}</div>
      </div>
    </div>
  );
}

// ── Add Meal Modal (with history suggest) ─────────────────────────
// ── Nutrition Camera Scanner ─────────────────────────────────────
function NutritionCameraModal({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState("栄養成分表示にカメラを向けてください");

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      }).catch(() => setStatus("カメラへのアクセスが拒否されました"));
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const capture = async () => {
    if (!videoRef.current || scanning) return;
    setScanning(true);
    setStatus("AIが栄養成分を読み取り中...");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
      const base64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 300,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
              { type: "text", text: 'この画像の栄養成分表示から数値を読み取ってください。必ずJSON形式のみで返答してください（他のテキスト不要）。形式: {"calories": 数値, "protein": 数値, "fat": 数値, "carbs": 数値, "amount": "表示単位(例:100gあたり)"} 。数値が読み取れない場合はnullにしてください。' }
            ]
          }]
        })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const json = JSON.parse(text.replace(/```json|```/g, "").trim());
      streamRef.current?.getTracks().forEach(t => t.stop());
      onDetected(json);
    } catch(e) {
      setStatus("読み取り失敗。もう一度試してください。");
      setScanning(false);
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.95)", zIndex:1200, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:400 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
          <div style={{ fontFamily:"'DM Mono',monospace", color:"#c8f080", fontSize:14 }}>栄養成分をスキャン</div>
          <button onClick={onClose} style={{ background:"none", border:"1px solid #333", color:"#888", borderRadius:6, padding:"4px 14px", cursor:"pointer" }}>閉じる</button>
        </div>
        <div style={{ position:"relative", background:"#000", borderRadius:14, overflow:"hidden", aspectRatio:"4/3", marginBottom:14 }}>
          <video ref={videoRef} style={{ width:"100%", height:"100%", objectFit:"cover" }} muted playsInline />
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
            <div style={{ width:"85%", height:"55%", border:"2px solid #f0c060", borderRadius:8, boxShadow:"0 0 0 9999px rgba(0,0,0,0.4)" }} />
          </div>
        </div>
        <div style={{ fontSize:12, color:"#666", textAlign:"center", marginBottom:14 }}>{status}</div>
        <button onClick={capture} disabled={scanning}
          style={{ width:"100%", background: scanning ? "#1a2a1a" : "#c8f080", color: scanning ? "#c8f080" : "#0a0a0f",
            border: scanning ? "1px solid #2a5030" : "none", borderRadius:10, padding:14, fontSize:15, fontWeight:700, cursor: scanning ? "default" : "pointer" }}>
          {scanning ? "⏳ 読み取り中..." : "📷 撮影して読み取る"}
        </button>
      </div>
    </div>
  );
}

// ── Food Register Modal ────────────────────────────────────────────
function FoodRegisterModal({ initialData, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:       initialData?.name        || "",
    barcode:    initialData?.barcode     || "",
    baseAmount: initialData?.baseAmount != null ? String(initialData.baseAmount) : "100",
    baseUnit:   initialData?.baseUnit    || "g",
    calories:   initialData?.calories != null ? String(initialData.calories) : "",
    protein:    initialData?.protein  != null ? String(initialData.protein)  : "",
    fat:        initialData?.fat      != null ? String(initialData.fat)      : "",
    carbs:      initialData?.carbs    != null ? String(initialData.carbs)    : "",
  });
  const handleSave = () => {
    if (!form.name.trim() || !form.baseAmount) return;
    onSave({
      id: Date.now(),
      name:       form.name.trim(),
      barcode:    form.barcode || null,
      baseAmount: parseFloat(form.baseAmount) || 100,
      baseUnit:   form.baseUnit || "g",
      calories:   parseFloat(form.calories) || 0,
      protein:    parseFloat(form.protein)  || 0,
      fat:        parseFloat(form.fat)      || 0,
      carbs:      parseFloat(form.carbs)    || 0,
    });
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:1200, display:"flex", alignItems:"flex-end" }}>
      <div style={{ width:"100%", background:"#0f1015", borderRadius:"18px 18px 0 0", padding:"20px 20px 40px", border:"1px solid #1c1c24", maxHeight:"92vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <div style={{ fontFamily:"'DM Mono',monospace", color:"#c8f080", fontSize:14 }}>食品を登録</div>
          <button onClick={onCancel} style={{ background:"none", border:"none", color:"#555", fontSize:22, cursor:"pointer" }}>×</button>
        </div>
        <div style={{ fontSize:11, color:"#555", marginBottom:16 }}>登録すると次回から自動入力できます</div>
        <div style={{ marginBottom:12 }}>
          <div style={ls}>食品名</div>
          <input className="fi" placeholder="例: サラダチキン プレーン" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} autoFocus />
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:10, marginBottom:12 }}>
          <div>
            <div style={ls}>基準量（数字のみ）</div>
            <input className="fi" type="number" placeholder="100" value={form.baseAmount} onChange={e => setForm(f=>({...f,baseAmount:e.target.value}))} />
          </div>
          <div>
            <div style={ls}>単位</div>
            <input className="fi" placeholder="g" value={form.baseUnit} onChange={e => setForm(f=>({...f,baseUnit:e.target.value}))} />
          </div>
        </div>
        <div style={{ fontSize:11, color:"#666", marginBottom:10 }}>↑ 例: 100・g、1・個、1・食</div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, color:"#888", marginBottom:8 }}>栄養成分（基準量あたり）</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[["calories","カロリー (kcal)","#f0c060"],["protein","P タンパク質 (g)","#c8f080"],["fat","F 脂質 (g)","#f0b050"],["carbs","C 炭水化物 (g)","#60a8f0"]].map(([key,label,color]) => (
              <div key={key}>
                <div style={{...ls, color}}>{label}</div>
                <input className="fi" type="number" placeholder="0" value={form[key]} onChange={e => setForm(f=>({...f,[key]:e.target.value}))} />
              </div>
            ))}
          </div>
        </div>
        <button className="save-btn" onClick={handleSave} style={{ marginBottom:10 }}>登録する</button>
        <button onClick={onCancel} style={{ width:"100%", background:"none", border:"1px solid #222", borderRadius:8, padding:13, color:"#555", cursor:"pointer", fontSize:14 }}>キャンセル</button>
      </div>
    </div>
  );
}

function AddMealModal({ onAdd, onClose, presetTime, mealHistory, foodDb, onSaveFoodDb }) {
  const [meal, setMeal] = useState({ time: presetTime || new Date().toTimeString().slice(0,5), name:"", calories:"", protein:"", fat:"", carbs:"", amount:"" });
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [showNutritionCam, setShowNutritionCam] = useState(false);
  const [selectedDbFood, setSelectedDbFood] = useState(null);
  const [amountNum, setAmountNum] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [registerInitial, setRegisterInitial] = useState(null);

  // サジェスト: 個人DBを優先、次に履歴
  useEffect(() => {
    if (!query.trim()) { setSuggestions([]); return; }
    const q = query.toLowerCase();
    const dbMatches  = (foodDb || []).filter(f => f.name.toLowerCase().includes(q));
    const histMatches = mealHistory.filter(m => m.name.toLowerCase().includes(q) && !dbMatches.find(d => d.name === m.name));
    setSuggestions([...dbMatches.slice(0,4).map(f=>({...f,_fromDb:true})), ...histMatches.slice(0,2)]);
  }, [query, mealHistory, foodDb]);

  // 数量変更時にPFCを自動計算
  useEffect(() => {
    if (!selectedDbFood) return;
    const num = parseFloat(amountNum);
    if (!num || !selectedDbFood.baseAmount) return;
    const scale = num / selectedDbFood.baseAmount;
    const r = (v) => String(Math.round(v * scale * 10) / 10);
    setMeal(m => ({
      ...m,
      calories: r(selectedDbFood.calories),
      protein:  r(selectedDbFood.protein),
      fat:      r(selectedDbFood.fat),
      carbs:    r(selectedDbFood.carbs),
      amount:   `${amountNum}${selectedDbFood.baseUnit}`,
    }));
  }, [amountNum, selectedDbFood]);

  const applyDbFood = (dbFood, customAmountNum) => {
    setSelectedDbFood(dbFood);
    setQuery(dbFood.name);
    setMeal(m => ({ ...m, name: dbFood.name }));
    setAmountNum(customAmountNum != null ? String(customAmountNum) : String(dbFood.baseAmount));
    setSuggestions([]);
  };

  const applyHistory = (h) => {
    setSelectedDbFood(null);
    setAmountNum("");
    setMeal(m => ({ ...m, name: h.name, calories: h.calories, protein: h.protein, fat: h.fat, carbs: h.carbs, amount: h.amount }));
    setQuery(h.name);
    setSuggestions([]);
  };

  const handleNutritionDetected = (data) => {
    setShowNutritionCam(false);
    setMeal(m => ({
      ...m,
      calories: data.calories != null ? String(data.calories) : m.calories,
      protein:  data.protein  != null ? String(data.protein)  : m.protein,
      fat:      data.fat      != null ? String(data.fat)      : m.fat,
      carbs:    data.carbs    != null ? String(data.carbs)    : m.carbs,
      amount:   data.amount   || m.amount,
    }));
  };

  const handleAdd = () => {
    if (!meal.name.trim()) return;
    onAdd({ ...meal, name: query || meal.name, id: Date.now() });
    onClose();
  };

  const handleBarcodeDetected = async (code) => {
    setShowScanner(false);
    // 1. まず個人DBを検索
    const dbMatch = (foodDb || []).find(f => f.barcode === code);
    if (dbMatch) { applyDbFood(dbMatch); return; }
    // 2. Open Food Facts APIを検索
    setQuery(`検索中...`);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
      const data = await res.json();
      if (data.status === 1 && data.product) {
        const p = data.product;
        const n = p.nutriments || {};
        setRegisterInitial({
          name:       p.product_name_ja || p.product_name || p.generic_name || "",
          barcode:    code,
          baseAmount: 100,
          baseUnit:   "g",
          calories:   n["energy-kcal_100g"] != null ? Math.round(n["energy-kcal_100g"]) : "",
          protein:    n.proteins_100g       != null ? Math.round(n.proteins_100g * 10) / 10 : "",
          fat:        n.fat_100g            != null ? Math.round(n.fat_100g * 10) / 10 : "",
          carbs:      n.carbohydrates_100g  != null ? Math.round(n.carbohydrates_100g * 10) / 10 : "",
        });
      } else {
        setRegisterInitial({ barcode: code, name: "", baseAmount: 100, baseUnit: "g" });
      }
    } catch {
      setRegisterInitial({ barcode: code, name: "", baseAmount: 100, baseUnit: "g" });
    }
    setQuery("");
    setShowRegister(true);
  };

  const handleRegisterSave = (newFood) => {
    onSaveFoodDb(newFood);
    applyDbFood(newFood);
    setShowRegister(false);
  };

  if (showScanner) return <BarcodeModal onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />;
  if (showNutritionCam) return <NutritionCameraModal onDetected={handleNutritionDetected} onClose={() => setShowNutritionCam(false)} />;
  if (showRegister) return <FoodRegisterModal initialData={registerInitial} onSave={handleRegisterSave} onCancel={() => { setShowRegister(false); setQuery(""); }} />;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:1000, display:"flex", alignItems:"flex-end" }}>
      <div style={{ width:"100%", background:"#0f1015", borderRadius:"18px 18px 0 0", padding:"20px 20px 40px", border:"1px solid #1c1c24", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <div style={{ fontFamily:"'DM Mono',monospace", color:"#c8f080", fontSize:14 }}>食品を追加</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#555", fontSize:22, cursor:"pointer" }}>×</button>
        </div>

        <div style={{ marginBottom:12 }}>
          <div style={ls}>時刻</div>
          <input type="time" className="fi" value={meal.time} onChange={e => setMeal(m=>({...m,time:e.target.value}))} />
        </div>

        {/* 食品名 + バーコード */}
        <div style={{ marginBottom: suggestions.length ? 0 : 12, position:"relative" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={ls}>食品名</div>
            <button onClick={() => setShowRegister(true) || setRegisterInitial(null)}
              style={{ background:"none", border:"none", color:"#555", fontSize:11, cursor:"pointer", marginBottom:6 }}>
              ＋ 新規登録
            </button>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <input className="fi" placeholder="食品名を入力 or バーコード読取"
              value={query}
              onChange={e => { setQuery(e.target.value); setMeal(m=>({...m,name:e.target.value})); setSelectedDbFood(null); setAmountNum(""); }}
              style={{ flex:1 }} />
            <button onClick={() => setShowScanner(true)}
              title="バーコードで商品名を読み取る"
              style={{ background:"#111318", border:"1px solid #2a3050", color:"#7090c8", borderRadius:8, padding:"0 14px", cursor:"pointer", fontSize:16, flexShrink:0 }}>
              ▦
            </button>
          </div>
          {suggestions.length > 0 && (
            <div style={{ background:"#111318", border:"1px solid #2a2a36", borderRadius:"0 0 10px 10px", overflow:"hidden", marginBottom:12 }}>
              {suggestions.map((h, i) => (
                <div key={i} onClick={() => h._fromDb ? applyDbFood(h) : applyHistory(h)}
                  style={{ padding:"10px 12px", cursor:"pointer", borderBottom:"1px solid #1c1c24", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:13 }}>{h.name}</span>
                      {h._fromDb && <span style={{ fontSize:9, background:"#1a2a1a", color:"#c8f080", border:"1px solid #2a5030", borderRadius:3, padding:"1px 5px" }}>DB</span>}
                    </div>
                    {h._fromDb
                      ? <div style={{ fontSize:11, color:"#555" }}>{h.baseAmount}{h.baseUnit}あたり</div>
                      : h.amount && <div style={{ fontSize:11, color:"#555" }}>{h.amount}</div>
                    }
                  </div>
                  <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                    {h.calories && <span className="pill"><span style={{color:"#f0c060",fontSize:10}}>kcal</span><span style={{color:"#aaa"}}>{h.calories}</span></span>}
                    {h.protein  && <span className="pill"><span style={{color:"#c8f080",fontSize:10}}>P</span><span style={{color:"#aaa"}}>{h.protein}g</span></span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 量の入力 */}
        <div style={{ marginBottom:12 }}>
          {selectedDbFood ? (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={ls}>量</div>
                <div style={{ fontSize:11, color:"#555", marginBottom:6 }}>基準: {selectedDbFood.baseAmount}{selectedDbFood.baseUnit} あたり</div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input className="fi" type="number" placeholder={String(selectedDbFood.baseAmount)}
                  value={amountNum}
                  onChange={e => setAmountNum(e.target.value)}
                  style={{ flex:1 }} />
                <div style={{ background:"#1a1a2a", border:"1px solid #2a2a3a", borderRadius:8, padding:"9px 14px", color:"#7090c8", fontSize:14, flexShrink:0, fontFamily:"'DM Mono',monospace" }}>
                  {selectedDbFood.baseUnit}
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={ls}>量 (g / 個 など)</div>
              <input className="fi" placeholder="例: 150g, 1個, 0.5食" value={meal.amount} onChange={e => setMeal(m=>({...m,amount:e.target.value}))} />
            </>
          )}
        </div>

        {/* PFC */}
        <div style={{ marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={ls}>栄養成分{selectedDbFood ? " (自動計算)" : ""}</div>
            <button onClick={() => setShowNutritionCam(true)}
              style={{ background:"#1a1a0a", border:"1px solid #4a4020", color:"#f0c060", borderRadius:8, padding:"6px 12px", fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
              📷 撮影して読取
            </button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
            {[["calories","カロリー (kcal)","#f0c060"],["protein","P タンパク質 (g)","#c8f080"],["fat","F 脂質 (g)","#f0b050"],["carbs","C 炭水化物 (g)","#60a8f0"]].map(([key,label,color]) => (
              <div key={key}>
                <div style={{...ls, color}}>{label}</div>
                <input className="fi" type="number" placeholder="0" value={meal[key]}
                  onChange={e => { setMeal(m=>({...m,[key]:e.target.value})); }}
                  style={{ background: selectedDbFood ? "#0d1a0d" : undefined }} />
              </div>
            ))}
          </div>
        </div>

        <button className="save-btn" onClick={handleAdd}>追加する</button>
      </div>
    </div>
  );
}

// ── Interval Picker (スクロール式・15秒刻み) ─────────────────────
function IntervalPicker({ value, onChange, onClose }) {
  // options: 0:15, 0:30, ... 0:45, 1:00, 1:15 ... 10:00  (15秒刻み)
  const options = [];
  for (let s = 15; s <= 600; s += 15) {
    const m = Math.floor(s / 60), sec = s % 60;
    options.push({ label: `${m}:${String(sec).padStart(2,'0')}`, secs: s });
  }
  const current = options.findIndex(o => o.secs === value) ?? 7; // default 2:00
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      const idx = options.findIndex(o => o.secs === value);
      ref.current.scrollTop = Math.max(0, (idx < 0 ? 7 : idx) - 2) * 48;
    }
  }, []);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#111318', borderRadius:16, padding:'20px 0', width:240, border:'1px solid #2a2a36' }}>
        <div style={{ textAlign:'center', fontFamily:"'DM Mono',monospace", fontSize:13, color:'#7090c8', marginBottom:12, paddingHorizontal:16 }}>インターバル</div>
        {/* Scroll list */}
        <div ref={ref} style={{ height:240, overflowY:'auto', position:'relative' }}>
          <div style={{ padding:'96px 0' }}>
            {options.map(o => (
              <div key={o.secs} onClick={() => onChange(o.secs)}
                style={{ height:48, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
                  fontFamily:"'DM Mono',monospace", fontSize:20,
                  color: o.secs === value ? '#c8f080' : '#555',
                  fontWeight: o.secs === value ? 600 : 400 }}>
                {o.label}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, padding:'12px 16px 0' }}>
          <button onClick={onClose} style={{ flex:1, background:'none', border:'1px solid #222', borderRadius:8, padding:'10px', color:'#888', cursor:'pointer', fontSize:13 }}>リセット</button>
          <button onClick={onClose} style={{ flex:1, background:'#c8f080', border:'none', borderRadius:8, padding:'10px', color:'#0a0a0f', fontWeight:700, cursor:'pointer', fontSize:13 }}>完了</button>
        </div>
      </div>
    </div>
  );
}

// ── Set Row (with bodyweight, side, interval timer) ───────────────
function SetRow({ set, idx, total, onUpdate, onRemove, intervalSecs, onComplete }) {
  const [timerLeft, setTimerLeft] = useState(null);
  const [running, setRunning] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (running && timerLeft > 0) {
      timerRef.current = setTimeout(() => setTimerLeft(t => t - 1), 1000);
    } else if (running && timerLeft === 0) {
      setRunning(false);
    }
    return () => clearTimeout(timerRef.current);
  }, [running, timerLeft]);

  const handleComplete = () => {
    onComplete(idx);
    if (intervalSecs > 0) {
      setTimerLeft(intervalSecs);
      setRunning(true);
    }
  };

  const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const pct = timerLeft !== null ? (timerLeft / intervalSecs) * 100 : 0;

  const updateField = (field, val) => onUpdate(idx, field, val);

  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ display:'flex', gap:5, alignItems:'center', marginBottom: set.completed ? 4 : 0 }}>
        {/* Set number */}
        <div style={{ fontSize:11, color:'#444', fontFamily:"'DM Mono',monospace", minWidth:22 }}>S{idx+1}</div>

        {/* Bodyweight toggle */}
        <button onClick={() => updateField('bodyweight', !set.bodyweight)}
          style={{ background: set.bodyweight ? '#1a2a1a' : '#111318', border: set.bodyweight ? '1px solid #c8f080' : '1px solid #222',
            borderRadius:6, padding:'7px 8px', fontSize:11, color: set.bodyweight ? '#c8f080' : '#555', cursor:'pointer', flexShrink:0, whiteSpace:'nowrap' }}>
          自重
        </button>

        {/* Weight input (hidden if bodyweight) */}
        {!set.bodyweight && (
          <input className="fi" type="number" placeholder="kg" value={set.weight}
            onChange={e => updateField('weight', e.target.value)} style={{ flex:2 }} />
        )}

        {/* Reps */}
        <input className="fi" type="number" placeholder="回数" value={set.reps}
          onChange={e => updateField('reps', e.target.value)} style={{ flex:2 }} />

        {/* 1RM (hidden if bodyweight) */}
        {!set.bodyweight && (
          <div style={{ flex:1.5, background:'#0a0a0f', border:'1px solid #222', borderRadius:6, padding:'8px 4px',
            fontSize:11, textAlign:'center', fontFamily:"'DM Mono',monospace", color: set.orm ? '#c8f080' : '#333' }}>
            {set.orm ? set.orm+'kg' : '1RM'}
          </div>
        )}

        {/* Side selector */}
        <select value={set.side || '両側'} onChange={e => updateField('side', e.target.value)}
          className="fi" style={{ flex:1.8, fontSize:11, padding:'8px 4px' }}>
          <option>両側</option>
          <option>左</option>
          <option>右</option>
        </select>

        {/* Complete / timer button */}
        {!set.completed ? (
          <button onClick={handleComplete}
            style={{ background:'#1a2a1a', border:'1px solid #2a5030', color:'#80c880', borderRadius:6,
              padding:'7px 8px', fontSize:11, cursor:'pointer', flexShrink:0 }}>
            完了
          </button>
        ) : (
          <div style={{ fontSize:11, color:'#c8f080', flexShrink:0 }}>✓</div>
        )}

        {total > 1 && <button className="del-btn" onClick={() => onRemove(idx)}>×</button>}
      </div>

      {/* Interval timer bar */}
      {timerLeft !== null && (
        <div style={{ marginLeft:27, marginTop:4 }}>
          <div style={{ height:3, background:'#1c1c24', borderRadius:2, overflow:'hidden', marginBottom:3 }}>
            <div style={{ height:'100%', width:`${pct}%`, background: pct > 30 ? '#c8f080' : '#f0a060',
              borderRadius:2, transition:'width 1s linear' }} />
          </div>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11,
            color: pct > 30 ? '#c8f080' : '#f06060' }}>
            {running ? `⏱ ${fmt(timerLeft)}` : timerLeft === 0 ? '✓ インターバル終了' : `⏸ ${fmt(timerLeft)}`}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Exercise Card (editable) ──────────────────────────────────────
function ExerciseCard({ ex, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ex);
  const [showIntervalPicker, setShowIntervalPicker] = useState(false);
  // intervalSecs: 0 means no interval
  const intervalSecs = parseInt(draft.intervalSecs) || 0;

  const fmtInterval = (s) => s > 0 ? `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` : '—';

  const updateDraftSet = (i, field, val) => {
    const newSets = draft.sets.map((s, j) => {
      if (j !== i) return s;
      const upd = { ...s, [field]: val };
      if (!upd.bodyweight) upd.orm = calc1RM(field==='weight'?val:upd.weight, field==='reps'?val:upd.reps);
      else upd.orm = '';
      return upd;
    });
    setDraft(d => ({ ...d, sets: newSets, totalVolume: calcExVol(newSets) }));
  };

  const completeSet = (i) => setDraft(d => ({ ...d, sets: d.sets.map((s,j) => j===i ? {...s, completed:true} : s) }));
  const addDraftSet = () => setDraft(d => ({ ...d, sets: [...d.sets, defaultSet()] }));
  const removeDraftSet = (i) => setDraft(d => ({ ...d, sets: d.sets.filter((_,j)=>j!==i) }));
  const save = () => { onUpdate(draft); setEditing(false); };

  if (editing) return (
    <div style={{ background:'#0f1015', border:'1px solid #c8f08066', borderRadius:10, padding:14, marginBottom:10 }}>
      {showIntervalPicker && (
        <IntervalPicker value={intervalSecs} onChange={s => setDraft(d=>({...d,intervalSecs:s}))} onClose={() => setShowIntervalPicker(false)} />
      )}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
        <div><div style={ls}>種目名</div><input className="fi" value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} /></div>
        <div><div style={ls}>部位</div>
          <select className="fi" value={draft.bodyPart} onChange={e=>setDraft(d=>({...d,bodyPart:e.target.value}))}>
            {BODY_PARTS.map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Interval picker */}
      <div style={{ marginBottom:12 }}>
        <div style={ls}>インターバル</div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div onClick={() => setShowIntervalPicker(true)}
            style={{ background:'#111318', border:'1px solid #222', borderRadius:8, padding:'10px 16px',
              fontFamily:"'DM Mono',monospace", fontSize:18, color: intervalSecs > 0 ? '#c8f080' : '#444',
              cursor:'pointer', minWidth:80, textAlign:'center' }}>
            {fmtInterval(intervalSecs)}
          </div>
          <span style={{ fontSize:12, color:'#555' }}>タップして設定</span>
        </div>
      </div>

      <div style={{ marginBottom:10 }}>
        <div style={ls}>メモ</div>
        <textarea className="fi" rows={2} placeholder="フォームの気づき、調子など..."
          value={draft.note||""} onChange={e=>setDraft(d=>({...d,note:e.target.value}))}
          style={{ resize:"none", fontSize:13 }} />
      </div>
      <div style={ls}>セット <span style={{ color:'#3a3a4a', fontSize:10, marginLeft:8 }}>1RMは重量×回数から自動計算</span></div>
      {draft.sets.map((set, i) => (
        <SetRow key={i} set={set} idx={i} total={draft.sets.length}
          onUpdate={updateDraftSet} onRemove={removeDraftSet}
          intervalSecs={intervalSecs} onComplete={completeSet} />
      ))}
      <div style={{ display:'flex', gap:8, marginTop:8 }}>
        <button className="add-btn" onClick={addDraftSet}>+ セット</button>
        <button className="add-btn" onClick={save} style={{ background:'#1a2a1a', borderColor:'#2a5030', color:'#80c880' }}>✓ 保存</button>
        <button className="add-btn" onClick={()=>setEditing(false)} style={{ color:'#666' }}>キャンセル</button>
      </div>
    </div>
  );

  return (
    <div style={{ background:'#0f1015', border:'1px solid #1c1c24', borderRadius:10, padding:14, marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div>
          <span style={{ fontSize:14, fontWeight:500 }}>{ex.name}</span>
          <span className="tag" style={{ marginLeft:6 }}>{ex.bodyPart}</span>
          {ex.intervalSecs > 0 && <span style={{ marginLeft:6, fontSize:11, color:'#7090c8', fontFamily:"'DM Mono',monospace" }}>⏱ {fmtInterval(parseInt(ex.intervalSecs))}</span>}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button className="del-btn" onClick={()=>setEditing(true)} style={{ color:'#7090c8', borderColor:'#2a3050' }}>編集</button>
          <button className="del-btn" onClick={onRemove}>削除</button>
        </div>
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        {ex.sets.map((s,i) => (
          <div key={i} style={{ background:'#111318', borderRadius:6, padding:'4px 8px', fontSize:11, fontFamily:"'DM Mono',monospace" }}>
            <span style={{ color:'#555' }}>S{i+1} </span>
            {s.bodyweight ? <span style={{ color:'#888' }}>自重</span> : <span>{s.weight}kg</span>}
            <span>×{s.reps}</span>
            {s.side && s.side !== '両側' && <span style={{ color:'#7090c8' }}> {s.side}</span>}
            {!s.bodyweight && s.orm && <span style={{ color:'#c8f080' }}> 1RM:{s.orm}kg</span>}
            {s.completed && <span style={{ color:'#c8f080' }}> ✓</span>}
          </div>
        ))}
      </div>
      <div style={{ fontSize:11, color:'#c8f080', marginTop:6, fontFamily:"'DM Mono',monospace" }}>Vol: {ex.totalVolume.toLocaleString()}kg</div>
      {ex.note && <div style={{ fontSize:12, color:'#6a8a6a', marginTop:6, fontStyle:'italic' }}>💬 {ex.note}</div>}
    </div>
  );
}


// ── Main App ───────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]       = useState("record");
  const [subTab, setSubTab] = useState("body");
  const [logs, setLogs]     = useState([]);
  const [form, setForm]     = useState(defaultLog());
  const [newEx, setNewEx]   = useState({ name:"", bodyPart:"胸", sets:[defaultSet()], intervalSecs:0, note:"" });
  const [showNewExIntervalPicker, setShowNewExIntervalPicker] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [showAddMeal, setShowAddMeal] = useState(null);
  const [showComplete, setShowComplete] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [customExercises, setCustomExercises] = useState({});
  const [foodDb, setFoodDb] = useState([]);
  const [copiedMeal, setCopiedMeal] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r  = await appStorage.get(STORAGE_KEY);       if (r)  setLogs(JSON.parse(r));
        const ce = await appStorage.get(CUSTOM_EX_KEY);     if (ce) setCustomExercises(JSON.parse(ce));
        const fd = await appStorage.get(FOOD_DB_KEY);       if (fd) setFoodDb(JSON.parse(fd));
        const cm = await appStorage.get(COPIED_MEAL_KEY);   if (cm) setCopiedMeal(JSON.parse(cm));
      } catch {}
    })();
  }, []);

  const saveLogs = useCallback(async (data) => { await appStorage.set(STORAGE_KEY, JSON.stringify(data)); }, []);

  const handleSave = async () => {
    // 種目名が入力済みの場合は自動で追加してから保存
    let currentForm = form;
    setForm(f => {
      if (newEx.name.trim()) {
        const sets = newEx.sets.map(s => ({ ...s, orm: s.bodyweight ? '' : calc1RM(s.weight, s.reps) }));
        const ex = { ...newEx, sets, id: Date.now(), totalVolume: calcExVol(sets) };
        currentForm = { ...f, training: [...f.training, ex] };
        return currentForm;
      }
      currentForm = f;
      return f;
    });
    if (newEx.name.trim()) {
      setNewEx({ name:"", bodyPart:"胸", sets:[defaultSet()], intervalSecs:0, note:"" });
    }
    // small delay to let state settle
    await new Promise(r => setTimeout(r, 50));
    const snap = currentForm;
    const t = calcTotals(snap.meals);
    const enriched = { ...snap, ...t };
    const idx = logs.findIndex(l => l.date === snap.date);
    const updated = idx >= 0 ? logs.map((l,i) => i===idx ? {...enriched,id:l.id} : l) : [enriched,...logs].sort((a,b)=>b.date.localeCompare(a.date));
    setLogs(updated); await saveLogs(updated);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    setShowComplete(true);
  };

  // Food history: 全ログから重複なしで食品リストを抽出
  const mealHistory = (() => {
    const seen = new Set();
    const list = [];
    for (const log of logs) {
      for (const m of (log.meals || [])) {
        if (!seen.has(m.name)) { seen.add(m.name); list.push(m); }
      }
    }
    return list;
  })();

  const addMeal = (meal) => setForm(f => ({ ...f, meals: [...f.meals, meal].sort((a,b) => a.time.localeCompare(b.time)) }));
  const removeMeal = (id) => setForm(f => ({ ...f, meals: f.meals.filter(m => m.id !== id) }));

  const saveFoodToDb = async (newFood) => {
    setFoodDb(prev => {
      const updated = [...prev.filter(f => f.id !== newFood.id), newFood];
      appStorage.set(FOOD_DB_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const copyMeal = (meal) => {
    const toCopy = { ...meal };
    setCopiedMeal(toCopy);
    appStorage.set(COPIED_MEAL_KEY, JSON.stringify(toCopy));
  };

  const pasteMeal = (targetTime) => {
    if (!copiedMeal) return;
    addMeal({ ...copiedMeal, id: Date.now(), time: targetTime });
  };

  const addExercise = () => {
    if (!newEx.name.trim()) return;
    const sets = newEx.sets.map(s => ({ ...s, orm: calc1RM(s.weight, s.reps) }));
    setForm(f => ({ ...f, training: [...f.training, { ...newEx, sets, id: Date.now(), totalVolume: calcExVol(sets) }] }));
    setNewEx({ name:"", bodyPart:"胸", sets:[defaultSet()], intervalSecs:0, note:"" });
  };
  const updateExercise = (id, updated) => setForm(f => ({ ...f, training: f.training.map(e => e.id===id ? {...updated,id} : e) }));
  const removeExercise = (id) => setForm(f => ({ ...f, training: f.training.filter(e => e.id !== id) }));
  const addCustomExercise = async (part, name) => {
    setCustomExercises(prev => {
      const updated = { ...prev, [part]: [...(prev[part]||[]), name] };
      appStorage.set(CUSTOM_EX_KEY, JSON.stringify(updated));
      return updated;
    });
  };
  const getLastRecord = (name) => {
    for (const log of logs) {
      const ex = (log.training || []).find(e => e.name === name);
      if (ex && ex.sets && ex.sets.length > 0) return { date: log.date, sets: ex.sets, note: ex.note || "" };
    }
    return null;
  };
  const handlePickExercise = (ex) => {
    const last = getLastRecord(ex.name);
    setNewEx(e => ({ ...e, name: ex.name, bodyPart: ex.bodyPart, lastRecord: last }));
    setShowPicker(false);
  };

  const addNewSet = () => setNewEx(e => ({ ...e, sets:[...e.sets, defaultSet()] }));
  const updateNewSet = (i, field, val) => {
    setNewEx(e => {
      const sets = e.sets.map((s,j) => {
        if (j !== i) return s;
        const upd = { ...s, [field]: val };
        if (!upd.bodyweight) upd.orm = calc1RM(field==="weight"?val:upd.weight, field==="reps"?val:upd.reps);
        else upd.orm = '';
        return upd;
      });
      return { ...e, sets };
    });
  };
  const completeNewSet = (i) => setNewEx(e => ({ ...e, sets: e.sets.map((s,j) => j===i ? {...s,completed:true} : s) }));
  const removeNewSet = (i) => setNewEx(e => ({ ...e, sets: e.sets.filter((_,j)=>j!==i) }));

  const totals = calcTotals(form.meals);
  const totalVolume = form.training.reduce((s,e) => s+(e.totalVolume||0), 0);

  const chartData = [...logs].reverse().slice(-30).map(l => ({
    date: l.date.slice(5),
    体重: parseFloat(l.weight)||null,
    カロリー: l.calories ? Math.round(l.calories) : null,
    タンパク質: l.protein ? Math.round(l.protein) : null,
    脂質: l.fat ? Math.round(l.fat) : null,
    炭水化物: l.carbs ? Math.round(l.carbs) : null,
    ボリューム: (l.training||[]).reduce((s,e)=>s+(e.totalVolume||0),0)||null,
  }));
  const scatterData = chartData.filter(d=>d.体重&&d.カロリー).map(d=>({x:d.カロリー,y:d.体重}));
  const ttp = { background:"#111318", border:"1px solid #2a2a36", borderRadius:6, color:"#e8e4d9" };

  return (
    <div style={{ fontFamily:"'Noto Sans JP',sans-serif", background:"#0a0a0f", minHeight:"100vh", color:"#e8e4d9" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#111}::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
        input,select,textarea{font-family:inherit}
        .tab-btn{background:none;border:none;cursor:pointer;padding:10px 20px;font-size:13px;letter-spacing:.1em;color:#555;font-family:'DM Mono',monospace}
        .tab-btn.active{color:#c8f080;border-bottom:1px solid #c8f080}
        .sub-btn{background:none;border:1px solid #222;border-radius:20px;cursor:pointer;padding:6px 16px;font-size:12px;color:#555;font-family:'DM Mono',monospace;white-space:nowrap}
        .sub-btn.active{background:#1a2a1a;border-color:#c8f080;color:#c8f080}
        .fi{background:#111318;border:1px solid #222;border-radius:6px;padding:8px 12px;color:#e8e4d9;font-size:14px;width:100%;outline:none;transition:border .2s}
        .fi:focus{border-color:#c8f080}
        .card{background:#0f1015;border:1px solid #1c1c24;border-radius:12px;padding:18px;margin-bottom:14px}
        .save-btn{background:#c8f080;color:#0a0a0f;border:none;border-radius:8px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;width:100%;letter-spacing:.05em;transition:all 0.15s}
        .save-btn:active{transform:scale(0.98)}
        .save-btn.saved{background:#4a8a4a}
        @keyframes toastIn{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-16px)}}
        .toast{position:fixed;top:72px;left:50%;transform:translateX(-50%);background:#1a3a1a;border:1px solid #c8f080;border-radius:10px;padding:10px 20px;font-family:'DM Mono',monospace;font-size:13px;color:#c8f080;z-index:2000;animation:toastIn 0.2s ease;pointer-events:none;white-space:nowrap}
        .tag{display:inline-block;background:#1a1f2e;color:#7090c8;border-radius:4px;padding:2px 8px;font-size:11px;margin:2px;font-family:'DM Mono',monospace}
        .del-btn{background:none;border:1px solid #2a2a36;color:#555;border-radius:4px;padding:3px 8px;font-size:12px;cursor:pointer;flex-shrink:0}
        .del-btn:hover{border-color:#ff6b6b;color:#ff6b6b}
        .add-btn{background:#1a1f2e;border:1px solid #2a3050;color:#7090c8;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer}
        .pill{display:inline-flex;align-items:center;gap:4px;background:#111318;border-radius:4px;padding:2px 7px;font-size:11px;font-family:'DM Mono',monospace}
        select.fi option{background:#111318}
        .st{font-size:11px;letter-spacing:.18em;color:#555;text-transform:uppercase;margin-bottom:12px;font-family:'DM Mono',monospace}
      `}</style>

      {/* Header */}
      <div style={{ padding:"18px 18px 0", display:"flex", alignItems:"baseline", gap:10 }}>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, color:"#c8f080" }}>FITLOG</div>
        <div style={{ fontSize:10, color:"#333", letterSpacing:".18em" }}>PHASE 1</div>
      </div>

      {/* Main tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid #1c1c24", marginTop:14, paddingLeft:6 }}>
        {[["record","記録"],["dashboard","分析"],["history","履歴"]].map(([k,l]) => (
          <button key={k} className={`tab-btn ${tab===k?"active":""}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      <div style={{ padding:"16px", maxWidth:640, margin:"0 auto" }}>

        {/* ── RECORD ── */}
        {tab === "record" && (
          <div>
            <input type="date" className="fi" value={form.date} onChange={e => {
                const newDate = e.target.value;
                const existing = logs.find(l => l.date === newDate);
                if (existing) {
                  setForm({ ...existing, meals: existing.meals||[], training: existing.training||[] });
                } else {
                  setForm({ ...defaultLog(), date: newDate });
                }
                setNewEx({ name:"", bodyPart:"胸", sets:[defaultSet()], intervalSecs:0, note:"" });
              }} style={{ marginBottom:14 }} />
            <div style={{ display:"flex", gap:8, marginBottom:16, overflowX:"auto", paddingBottom:2 }}>
              {[["body","ボディ"],["meal","食事"],["training","トレーニング"]].map(([k,l]) => (
                <button key={k} className={`sub-btn ${subTab===k?"active":""}`} onClick={()=>setSubTab(k)}>{l}</button>
              ))}
            </div>

            {/* Body */}
            {subTab === "body" && (
              <div className="card">
                <div className="st">ボディデータ</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                  <div><div style={ls}>体重 (kg)</div><input className="fi" type="number" step=".1" placeholder="71.0" value={form.weight} onChange={e=>setForm(f=>({...f,weight:e.target.value}))} /></div>
                  <div><div style={ls}>体温 (℃)</div><input className="fi" type="number" step=".1" placeholder="36.5" value={form.temp} onChange={e=>setForm(f=>({...f,temp:e.target.value}))} /></div>
                </div>
                <div style={ls}>メモ</div>
                <textarea className="fi" rows={3} placeholder="体調、気づきなど..." value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} style={{ resize:"vertical" }} />
              </div>
            )}

            {/* Meal timeline */}
            {subTab === "meal" && (
              <div>
                {/* Daily totals */}
                <div className="card" style={{ padding:14, marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10 }}>
                    <div style={{ fontSize:11, color:"#555", fontFamily:"'DM Mono',monospace", letterSpacing:".15em" }}>本日の合計</div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, color:"#f0c060" }}>{Math.round(totals.calories)} <span style={{ fontSize:12, color:"#666" }}>kcal</span></div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    {[["P",totals.protein,"#c8f080"],["F",totals.fat,"#f0b050"],["C",totals.carbs,"#60a8f0"]].map(([k,v,c]) => (
                      <div key={k} className="pill"><span style={{color:c,fontSize:10}}>{k}</span><span style={{color:"#ccc"}}>{Math.round(v)}g</span></div>
                    ))}
                  </div>
                  {totals.calories > 0 && (
                    <div style={{ display:"flex", height:3, borderRadius:2, overflow:"hidden", marginTop:10, gap:1 }}>
                      {[["P",totals.protein*4,"#c8f080"],["F",totals.fat*9,"#f0b050"],["C",totals.carbs*4,"#60a8f0"]].map(([k,v,c]) => (
                        <div key={k} style={{ flex:v||0, background:c }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Fixed time slots */}
                {Array.from({ length:18 }, (_,i) => {
                  const hour = i + 5;
                  const label = `${String(hour).padStart(2,"0")}:00`;
                  const mealsInSlot = form.meals.filter(m => parseInt(m.time.split(":")[0]) === hour);
                  const slotCal = mealsInSlot.reduce((s,m)=>s+(parseFloat(m.calories)||0),0);
                  return (
                    <div key={hour} style={{ display:"flex", alignItems:"stretch", marginBottom:2 }}>
                      <div style={{ width:46, flexShrink:0, paddingTop:12, fontFamily:"'DM Mono',monospace", fontSize:11, color:mealsInSlot.length?"#888":"#2a2a36", textAlign:"right", paddingRight:10 }}>{label}</div>
                      <div style={{ width:20, flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center" }}>
                        <div style={{ width:1, flex:1, background:mealsInSlot.length?"#2a3020":"#1a1a22" }} />
                        <div style={{ width:7, height:7, borderRadius:"50%", background:mealsInSlot.length?"#c8f080":"#222", border:mealsInSlot.length?"none":"1px solid #2a2a36", flexShrink:0, margin:"2px 0" }} />
                        <div style={{ width:1, flex:1, background:mealsInSlot.length?"#2a3020":"#1a1a22" }} />
                      </div>
                      <div style={{ flex:1, padding:"6px 0 6px 8px" }}>
                        {mealsInSlot.length > 0 && (
                          <div style={{ marginBottom:4 }}>
                            <div style={{ display:"flex", gap:4, marginBottom:4 }}>
                              {[["kcal",slotCal,"#f0c060"],["P",mealsInSlot.reduce((s,m)=>s+(parseFloat(m.protein)||0),0),"#c8f080"],["F",mealsInSlot.reduce((s,m)=>s+(parseFloat(m.fat)||0),0),"#f0b050"],["C",mealsInSlot.reduce((s,m)=>s+(parseFloat(m.carbs)||0),0),"#60a8f0"]].map(([k,v,c]) =>
                                v>0 ? <span key={k} className="pill"><span style={{color:c,fontSize:10}}>{k}</span><span style={{color:"#ccc"}}>{Math.round(v)}{k!=="kcal"?"g":""}</span></span> : null
                              )}
                            </div>
                            {mealsInSlot.map(meal => (
                              <div key={meal.id} style={{ display:"flex", alignItems:"center", background:"#111318", borderRadius:8, padding:"7px 10px", marginBottom:4, gap:8 }}>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:13, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{meal.name}</div>
                                  {meal.amount && <div style={{ fontSize:11, color:"#555" }}>{meal.amount}</div>}
                                </div>
                                <button
                                  onClick={() => copyMeal(meal)}
                                  title="コピー"
                                  style={{ background: copiedMeal?.id === meal.id ? "#1a2a1a" : "none", border:"1px solid #2a2a36", color: copiedMeal?.id === meal.id ? "#c8f080" : "#555", borderRadius:4, padding:"3px 7px", fontSize:11, cursor:"pointer", flexShrink:0 }}>
                                  📋
                                </button>
                                <button className="del-btn" onClick={()=>removeMeal(meal.id)}>×</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                          <button onClick={()=>setShowAddMeal(label)} style={{ background:"none", border:"none", color:"#2a3a4a", fontSize:14, cursor:"pointer", padding:"2px 0" }}>+</button>
                          {copiedMeal && (
                            <button onClick={() => pasteMeal(label)}
                              style={{ background:"#111a11", border:"1px solid #2a3a2a", color:"#6a8a5a", borderRadius:6, padding:"2px 8px", fontSize:11, cursor:"pointer" }}>
                              📋 {copiedMeal.name.length > 8 ? copiedMeal.name.slice(0,8)+"…" : copiedMeal.name} をペースト
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Training */}
            {subTab === "training" && (
              <div>
                {form.training.map(ex => (
                  <ExerciseCard key={ex.id} ex={ex}
                    onUpdate={updated => updateExercise(ex.id, updated)}
                    onRemove={() => removeExercise(ex.id)}
                  />
                ))}

                {/* Add new exercise form */}
                {showNewExIntervalPicker && (
                  <IntervalPicker value={newEx.intervalSecs} onChange={s=>setNewEx(e=>({...e,intervalSecs:s}))} onClose={()=>setShowNewExIntervalPicker(false)} />
                )}
                <div style={{ background:"#0a0a0f", border:"1px dashed #222", borderRadius:10, padding:14, marginBottom:14 }}>
                  {/* 種目選択 */}
                  <div style={{ marginBottom:12 }}>
                    <div style={ls}>種目</div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom: newEx.lastRecord ? 8 : 0 }}>
                      <div className="fi" style={{ flex:1, color: newEx.name ? "#e8e4d9" : "#444", cursor:"pointer" }} onClick={()=>setShowPicker(true)}>
                        {newEx.name || "種目を選択"}
                      </div>
                      {newEx.name && <span className="tag">{newEx.bodyPart}</span>}
                      <button onClick={()=>setShowPicker(true)} style={{ background:"#1a1f2e", border:"1px solid #2a3050", color:"#7090c8", borderRadius:6, padding:"8px 12px", cursor:"pointer", fontSize:12, whiteSpace:"nowrap" }}>選択</button>
                    </div>
                    {/* 前回の記録 */}
                    {newEx.lastRecord && (
                      <div style={{ background:"#0a0f0a", border:"1px solid #1a3020", borderRadius:8, padding:"8px 12px" }}>
                        <div style={{ fontSize:10, color:"#4a6a4a", fontFamily:"'DM Mono',monospace", marginBottom:5 }}>前回 {newEx.lastRecord.date.slice(5)}</div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom: newEx.lastRecord.note ? 6 : 0 }}>
                          {newEx.lastRecord.sets.map((s, si) => (
                            <div key={si} style={{ background:"#111a11", borderRadius:5, padding:"3px 8px", fontSize:12, fontFamily:"'DM Mono',monospace" }}>
                              <span style={{ color:"#4a6a4a" }}>S{si+1} </span>
                              {s.bodyweight ? <span style={{ color:"#80a880" }}>自重</span> : <span style={{ color:"#a0c8a0" }}>{s.weight}kg</span>}
                              <span style={{ color:"#6a8a6a" }}>×{s.reps}</span>
                              {!s.bodyweight && s.orm && <span style={{ color:"#c8f080" }}> 1RM:{s.orm}kg</span>}
                            </div>
                          ))}
                        </div>
                        {newEx.lastRecord.note && <div style={{ fontSize:11, color:"#6a8a6a", fontStyle:"italic" }}>💬 {newEx.lastRecord.note}</div>}
                      </div>
                    )}
                  </div>
                  {/* Interval */}
                  <div style={{ marginBottom:12 }}>
                    <div style={ls}>インターバル</div>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div onClick={()=>setShowNewExIntervalPicker(true)}
                        style={{ background:"#111318", border:"1px solid #222", borderRadius:8, padding:"10px 16px",
                          fontFamily:"'DM Mono',monospace", fontSize:18, color: newEx.intervalSecs>0 ? "#c8f080" : "#444",
                          cursor:"pointer", minWidth:80, textAlign:"center" }}>
                        {newEx.intervalSecs>0 ? `${Math.floor(newEx.intervalSecs/60)}:${String(newEx.intervalSecs%60).padStart(2,'0')}` : "—"}
                      </div>
                      <span style={{ fontSize:12, color:"#555" }}>タップして設定</span>
                    </div>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={ls}>メモ</div>
                    <textarea className="fi" rows={2} placeholder="フォームの気づき、調子など..."
                      value={newEx.note} onChange={e=>setNewEx(ex=>({...ex,note:e.target.value}))}
                      style={{ resize:"none", fontSize:13 }} />
                  </div>
                  <div style={ls}>セット <span style={{ color:"#3a3a4a", fontSize:10, marginLeft:8 }}>1RMは重量×回数から自動計算</span></div>
                  {newEx.sets.map((set,i) => (
                    <SetRow key={i} set={set} idx={i} total={newEx.sets.length}
                      onUpdate={updateNewSet} onRemove={removeNewSet}
                      intervalSecs={newEx.intervalSecs} onComplete={completeNewSet} />
                  ))}
                  <div style={{ display:"flex", gap:8, marginTop:8 }}>
                    <button className="add-btn" onClick={addNewSet}>+ セット</button>
                  </div>
                </div>

                {totalVolume > 0 && (
                  <div style={{ padding:"10px 14px", background:"#0f1a0f", border:"1px solid #1a3020", borderRadius:8, display:"flex", justifyContent:"space-between", marginBottom:14 }}>
                    <span style={{ fontSize:12, color:"#666" }}>総ボリューム</span>
                    <span style={{ fontFamily:"'DM Mono',monospace", color:"#c8f080", fontSize:16 }}>{totalVolume.toLocaleString()} kg</span>
                  </div>
                )}
                <button className={`save-btn${saved?" saved":""}`} onClick={handleSave} style={{ marginTop:4 }}>{saved ? "✓ 完了！" : "1日のトレーニングを完了"}</button>
              </div>
            )}
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (
          <div>
            {logs.length === 0 ? (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#444" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📊</div><div>記録を追加するとグラフが表示されます</div>
              </div>
            ) : (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:14 }}>
                  {[["体重",logs[0]?.weight||"—","kg"],["Cal",logs[0]?.calories?Math.round(logs[0].calories):"—","kcal"],["P",logs[0]?.protein?Math.round(logs[0].protein):"—","g"],["記録",logs.length,"days"]].map(([l,v,u]) => (
                    <div key={l} className="card" style={{ padding:12, marginBottom:0, textAlign:"center" }}>
                      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:18, color:"#c8f080" }}>{v}</div>
                      <div style={{ fontSize:10, color:"#777", fontFamily:"'DM Mono',monospace" }}>{u}</div>
                      <div style={{ fontSize:10, color:"#444", marginTop:2 }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <div className="st">体重推移 (kg)</div>
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#1c1c24" /><XAxis dataKey="date" tick={{fill:"#555",fontSize:10}} /><YAxis tick={{fill:"#555",fontSize:10}} domain={["auto","auto"]} /><Tooltip contentStyle={ttp} /><Line type="monotone" dataKey="体重" stroke="#c8f080" strokeWidth={2} dot={{fill:"#c8f080",r:3}} connectNulls /></LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="card">
                  <div className="st">カロリー推移 (kcal)</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#1c1c24" /><XAxis dataKey="date" tick={{fill:"#555",fontSize:10}} /><YAxis tick={{fill:"#555",fontSize:10}} /><Tooltip contentStyle={ttp} /><Bar dataKey="カロリー" fill="#f0c060" radius={[3,3,0,0]} /></BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="card">
                  <div className="st">PFC推移 (g)</div>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#1c1c24" /><XAxis dataKey="date" tick={{fill:"#555",fontSize:10}} /><YAxis tick={{fill:"#555",fontSize:10}} /><Tooltip contentStyle={ttp} /><Line type="monotone" dataKey="タンパク質" stroke="#c8f080" strokeWidth={2} dot={false} connectNulls /><Line type="monotone" dataKey="脂質" stroke="#f0b050" strokeWidth={2} dot={false} connectNulls /><Line type="monotone" dataKey="炭水化物" stroke="#60a8f0" strokeWidth={2} dot={false} connectNulls /></LineChart>
                  </ResponsiveContainer>
                  <div style={{ display:"flex", gap:14, marginTop:8, fontSize:11, color:"#555" }}>
                    {[["P タンパク質","#c8f080"],["F 脂質","#f0b050"],["C 炭水化物","#60a8f0"]].map(([l,c]) => <span key={l}><span style={{color:c}}>■</span> {l}</span>)}
                  </div>
                </div>
                {chartData.some(d=>d.ボリューム) && (
                  <div className="card">
                    <div className="st">トレーニングボリューム (kg)</div>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#1c1c24" /><XAxis dataKey="date" tick={{fill:"#555",fontSize:10}} /><YAxis tick={{fill:"#555",fontSize:10}} /><Tooltip contentStyle={ttp} /><Bar dataKey="ボリューム" fill="#a080f0" radius={[3,3,0,0]} /></BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {scatterData.length >= 3 && (
                  <div className="card">
                    <div className="st">相関: カロリー × 体重</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <ScatterChart><CartesianGrid strokeDasharray="3 3" stroke="#1c1c24" /><XAxis dataKey="x" name="カロリー" tick={{fill:"#555",fontSize:10}} /><YAxis dataKey="y" name="体重" tick={{fill:"#555",fontSize:10}} domain={["auto","auto"]} /><ZAxis range={[40,40]} /><Tooltip contentStyle={ttp} /><Scatter data={scatterData} fill="#f0a060" opacity={0.8} /></ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── HISTORY ── */}
        {tab === "history" && (
          <div>
            {logs.length === 0 ? (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#444" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📋</div><div>記録がまだありません</div>
              </div>
            ) : logs.map(log => (
              <div key={log.id} className="card" style={{ cursor:"pointer" }}
                onClick={() => { setForm({...log, meals:log.meals||[], training:log.training||[]}); setTab("record"); setSubTab("body"); }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:14, color:"#c8f080" }}>{log.date}</div>
                  <div style={{ fontSize:11, color:"#333" }}>タップして編集</div>
                </div>
                <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:6 }}>
                  {log.weight && <span style={{fontSize:12}}><span style={{color:"#555"}}>体重 </span><span style={{fontFamily:"'DM Mono',monospace"}}>{log.weight}kg</span></span>}
                  {log.calories>0 && <span style={{fontSize:12}}><span style={{color:"#555"}}>Cal </span><span style={{fontFamily:"'DM Mono',monospace"}}>{Math.round(log.calories)}kcal</span></span>}
                  {log.protein>0 && <span style={{fontSize:12}}><span style={{color:"#555"}}>P </span><span style={{fontFamily:"'DM Mono',monospace",color:"#c8f080"}}>{Math.round(log.protein)}g</span></span>}
                </div>
                {(log.meals||[]).length>0 && <div style={{fontSize:11,color:"#444",marginBottom:4}}>{log.meals.length}食品</div>}
                {(log.training||[]).length>0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                    {log.training.map(ex => <span key={ex.id} className="tag">{ex.name}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddMeal !== null && <AddMealModal onAdd={addMeal} onClose={()=>setShowAddMeal(null)} presetTime={showAddMeal} mealHistory={mealHistory} foodDb={foodDb} onSaveFoodDb={saveFoodToDb} />}
      {/* Toast notification */}
      {saved && <div className="toast">✓ トレーニングを保存しました</div>}

      {/* Completion modal */}
      {showComplete && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ background:'#0f1015', border:'1px solid #1c1c24', borderRadius:20, padding:32, textAlign:'center', maxWidth:320, width:'100%' }}>
            <div style={{ fontSize:52, marginBottom:16 }}>💪</div>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:20, color:'#c8f080', marginBottom:8 }}>お疲れ様でした！</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:24, lineHeight:1.6 }}>
              今日のトレーニングを記録しました。<br />しっかり休んで次回も頑張りましょう！
            </div>
            {form.training.length > 0 && (
              <div style={{ background:'#0a0a0f', borderRadius:10, padding:'12px 16px', marginBottom:20, textAlign:'left' }}>
                <div style={{ fontSize:10, color:'#555', fontFamily:"'DM Mono',monospace", marginBottom:8, letterSpacing:'0.15em' }}>TODAY'S SUMMARY</div>
                {form.training.map((ex,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid #1c1c24', fontSize:13 }}>
                    <span>{ex.name}</span>
                    <span style={{ fontFamily:"'DM Mono',monospace", color:'#c8f080', fontSize:12 }}>{ex.sets.length}セット · {ex.totalVolume.toLocaleString()}kg</span>
                  </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:10, fontSize:12 }}>
                  <span style={{ color:'#555' }}>総ボリューム</span>
                  <span style={{ fontFamily:"'DM Mono',monospace", color:'#c8f080', fontWeight:700 }}>
                    {form.training.reduce((s,e)=>s+(e.totalVolume||0),0).toLocaleString()} kg
                  </span>
                </div>
              </div>
            )}
            <button onClick={() => setShowComplete(false)} className="save-btn">閉じる</button>
          </div>
        </div>
      )}

      {showPicker && <ExercisePicker onSelect={handlePickExercise} onClose={()=>setShowPicker(false)} customExercises={customExercises} onAddCustom={addCustomExercise} logs={logs} />}
    </div>
  );
}
