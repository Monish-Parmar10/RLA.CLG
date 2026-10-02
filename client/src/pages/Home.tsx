import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import * as api from "@/lib/api";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Cpu,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderOpen,
  Gauge,
  HelpCircle,
  Highlighter,
  Info,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  Lock,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Plus,
  Quote,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Upload,
  UserRound,
  UsersRound,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";

type View = "overview" | "guide" | "builder" | "analyzer";
type AnalyzerTab = "summary" | "scorecard" | "reviewer" | "chat";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-label="ResearchLens">
      <span className="brand-orbit orbit-one" />
      <span className="brand-orbit orbit-two" />
      <span className="brand-core" />
    </div>
  );
}

function IconButton({
  label,
  children,
  onClick,
  className,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button className={cn("icon-button", className)} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="section-eyebrow">{children}</div>;
}

function PrimaryButton({
  children,
  onClick,
  className,
  icon,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button className={cn("primary-button", className)} onClick={onClick} disabled={disabled}>
      {children}
      {icon ?? <ArrowRight size={16} strokeWidth={2.5} />}
    </button>
  );
}

function SoftButton({
  children,
  onClick,
  className,
  icon,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button className={cn("soft-button", className)} onClick={onClick} disabled={disabled}>
      {icon}
      {children}
    </button>
  );
}

function ProgressLine({ value, tone = "coral" }: { value: number; tone?: string }) {
  return (
    <div className="progress-track">
      <div className={cn("progress-fill", `fill-${tone}`)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 80 ? "#2e8555" : score >= 60 ? "#d97706" : "#dc2626";
  return (
    <div className="score-ring" style={{ background: `conic-gradient(${tone} ${score * 3.6}deg, #f5dfc3 0deg)` }}>
      <div className="score-ring-inner">
        <span className="score-number">{score}</span>
        <span className="score-label">/ 100</span>
      </div>
    </div>
  );
}

function FallbackBadge({ message }: { message?: string }) {
  return (
    <div className="fallback-banner">
      <AlertCircle size={15} />
      <span>{message || "AI provider unavailable: showing fallback analysis."}</span>
    </div>
  );
}


export default function Home() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<View>("overview");
  const [analyzerTab, setAnalyzerTab] = useState<AnalyzerTab>("summary");
  const [formatReady, setFormatReady] = useState(false);

  const [aiProvider, setAiProvider] = useState<'gemini' | 'ollama'>('gemini');
  const [aiStatus, setAiStatus] = useState<{
    gemini: { available: boolean; model?: string; reason?: string };
    ollama: { available: boolean; model?: string; reason?: string };
  } | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [papers, setPapers] = useState<api.Paper[]>([]);
  const [activePaper, setActivePaper] = useState<api.Paper | null>(null);
  const [paperName, setPaperName] = useState("Neural Retrieval for Student Research");

  const [title, setTitle] = useState("Neural Retrieval for Student Research");
  const [abstract, setAbstract] = useState(
    "This paper introduces a lightweight retrieval pipeline that helps student researchers discover, compare, and synthesize relevant literature with less friction."
  );
  const [activeDraft, setActiveDraft] = useState<api.Draft | null>(null);

  const [summary, setSummary] = useState<api.PaperSummary | null>(null);
  const [analysis, setAnalysis] = useState<api.AnalysisScore | null>(null);
  const [reviews, setReviews] = useState<api.Review[]>([]);

  const [chat, setChat] = useState<api.ChatMessage[]>([
    {
      role: "assistant",
      text: "I've indexed this draft. Ask me to explain any section, verify claims, or evaluate methodological limitations.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLoadingStep, setChatLoadingStep] = useState<"searching" | "generating">("searching");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userName = user?.name || "Researcher";
  const userInitials = userName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  useEffect(() => {
    api.getPapers().then((fetched) => {
      setPapers(fetched);
      if (fetched.length > 0 && !activePaper) {
        const first = fetched[0];
        setActivePaper(first);
        setPaperName(first.title || first.original_name);
        setTitle(first.title || "Untitled Paper");
        setAbstract(first.abstract || "");
      }
    }).catch(() => {});

    api.getAiProvider().then((res) => {
      if (res?.provider) setAiProvider(res.provider);
    }).catch(() => {});

    api.getAiStatus().then(setAiStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activePaper) return;
    api.getSummary(activePaper.id).then(setSummary).catch(() => {});
    api.getAnalysis(activePaper.id).then(setAnalysis).catch(() => {});
    api.getReviews(activePaper.id).then(setReviews).catch(() => {});
    api.getChatHistory(activePaper.id).then((msgs) => {
      if (msgs.length > 0) setChat(msgs);
    }).catch(() => {});
  }, [activePaper]);

  const navigate = (nextView: View) => {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleProviderChange = async (provider: 'gemini' | 'ollama') => {
    try {
      await api.setAiProvider(provider);
      setAiProvider(provider);
      toast.success(`AI Provider switched to ${provider === 'gemini' ? 'Google Gemini' : 'Local Ollama'}`);
      api.getAiStatus().then(setAiStatus).catch(() => {});
    } catch (err: any) {
      toast.error('Failed to change provider', { description: err.message });
    }
  };

  const ingestPdf = async (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Invalid file type", { description: "ResearchLens accepts research papers in PDF format only." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large", { description: "Maximum file size is 10 MB." });
      return;
    }
    setIsUploading(true);
    setUploadedFileName(file.name);
    try {
      const paper = await api.uploadPaper(file);
      setPapers((prev) => [paper, ...prev]);
      setActivePaper(paper);
      setPaperName(paper.title || file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim());
      setTitle(paper.title || paperName);
      setAbstract(paper.abstract || abstract);
      setFormatReady(false);
      setSummary(null);
      setAnalysis(null);
      setReviews([]);
      setChat([
        {
          role: "assistant",
          text: `I've indexed "${file.name}" with ${paper.sections?.length || 0} sections. You can ask me to evaluate claims, summarize methods, or check IEEE formatting.`,
        },
      ]);
      setAnalyzerTab("summary");
      toast.success("PDF processed successfully", { description: `Extracted: ${paper.title || file.name}` });
      navigate("analyzer");
    } catch (err: any) {
      toast.error("Upload failed", { description: err.message || "Could not process the PDF" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    ingestPdf(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    ingestPdf(event.dataTransfer.files?.[0]);
  };

  const runSummary = async () => {
    if (!activePaper) {
      toast.error("Please upload a paper first");
      return;
    }
    setIsSummarizing(true);
    try {
      const res = await api.generateSummary(activePaper.id);
      setSummary(res);
      toast.success("Summary generated");
    } catch (err: any) {
      toast.error("Summary failed", { description: err.message });
    } finally {
      setIsSummarizing(false);
    }
  };

  const runAnalysis = async () => {
    if (!activePaper) {
      toast.error("Please upload a paper first");
      return;
    }
    setIsAnalyzing(true);
    try {
      const result = await api.analyzePaper(activePaper.id);
      setAnalysis(result);
      toast.success("Quality audit complete", { description: `Overall score: ${result.overall}/100` });
    } catch (err: any) {
      toast.error("Analysis failed", { description: err.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runReview = async () => {
    if (!activePaper) {
      toast.error("Please upload a paper first");
      return;
    }
    setIsReviewing(true);
    try {
      const result = await api.runReview(activePaper.id);
      setReviews(result);
      toast.success("Peer review simulation complete", { description: `Recommendation: ${result[0]?.recommendation || 'Evaluated'}` });
    } catch (err: any) {
      toast.error("Review failed", { description: err.message });
    } finally {
      setIsReviewing(false);
    }
  };

  const sendChat = async (preset?: string) => {
    const message = (preset ?? chatInput).trim();
    if (!message || chatLoading) return;

    setChat((current) => [...current, { role: "user", text: message }]);
    setChatInput("");
    setChatLoading(true);
    setChatLoadingStep("searching");

    setTimeout(() => {
      setChatLoadingStep("generating");
    }, 450);

    try {
      if (activePaper) {
        const response = await api.sendChatMessage(activePaper.id, message);
        setChat((current) => [
          ...current,
          { role: "assistant", text: response.text, sources: response.sources },
        ]);
      } else {
        setChat((current) => [
          ...current,
          {
            role: "assistant",
            text: "Please upload a research paper first to start asking grounded questions.",
          },
        ]);
      }
    } catch (err: any) {
      setChat((current) => [
        ...current,
        { role: "assistant", text: "Sorry, I encountered an error while querying your paper." },
      ]);
      toast.error("Chat error", { description: err.message });
    } finally {
      setChatLoading(false);
    }
  };

  const runFormat = async () => {
    setFormatReady(true);
    try {
      if (activeDraft) {
        await api.updateDraft(activeDraft.id, { format_applied: true });
      } else {
        const draft = await api.createDraft({
          paper_id: activePaper?.id,
          title,
          authors: userName,
          abstract,
          format_applied: true,
        });
        setActiveDraft(draft);
      }
      toast.success("IEEE structure applied", { description: "Your manuscript order is aligned with IEEE conference specifications." });
    } catch {
      toast.success("IEEE structure applied");
    }
  };

  const handleExport = async (format: "latex" | "docx" | "markdown") => {
    try {
      let draftId = activeDraft?.id;
      if (!draftId) {
        const draft = await api.createDraft({
          paper_id: activePaper?.id,
          title,
          authors: userName,
          abstract,
          format_applied: formatReady,
        });
        setActiveDraft(draft);
        draftId = draft.id;
      }
      const blob = await api.exportDraft(draftId, format);
      const ext = format === "latex" ? "tex" : format === "markdown" ? "md" : "docx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_")}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`, { description: `File downloaded: ${a.download}` });
    } catch (err: any) {
      toast.error("Export failed", { description: err.message });
    }
  };

  return (
    <div className="app-shell">
      <aside className={cn("sidebar", sidebarCollapsed && "sidebar-collapsed")}>
        <div className="sidebar-top">
          <button className="brand-lockup" onClick={() => navigate("overview")} aria-label="Go to ResearchLens overview">
            <BrandMark />
            {!sidebarCollapsed && (
              <span className="brand-wordmark">
                research<span>lens</span>
              </span>
            )}
          </button>
          <IconButton label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setSidebarCollapsed((c) => !c)}>
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </IconButton>
        </div>

        {!sidebarCollapsed && (
          <div className="workspace-select">
            <div className="workspace-icon"><FileText size={17} /></div>
            <div>
              <span className="micro-label">WORKSPACE</span>
              <strong>{userName}&apos;s research</strong>
            </div>
            <ChevronDown size={15} />
          </div>
        )}

        <div className="sidebar-section">
          {!sidebarCollapsed && <span className="micro-label">YOUR FLOW</span>}
          <nav className="nav-list" aria-label="Main navigation">
            {[
              { id: "overview" as View, label: "Overview", icon: LayoutDashboard },
              { id: "guide" as View, label: "The Guide", icon: BookOpen },
              { id: "builder" as View, label: "The Builder", icon: WandSparkles },
              { id: "analyzer" as View, label: "The Analyzer", icon: Gauge },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={cn("nav-item", view === item.id && "nav-item-active")}
                  onClick={() => navigate(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon size={18} strokeWidth={view === item.id ? 2.4 : 1.9} />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                  {!sidebarCollapsed && item.id === "analyzer" && papers.length > 0 && (
                    <span className="nav-badge">{papers.length}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {!sidebarCollapsed && (
          <div className="sidebar-bottom">
            <div className="mini-tip">
              <Cpu size={17} />
              <div>
                <strong>Active AI Model</strong>
                <p>{aiProvider === 'gemini' ? (aiStatus?.gemini?.model || 'Google Gemini') : (aiStatus?.ollama?.model || 'Local Ollama')}</p>
              </div>
            </div>
            <button className="nav-item" onClick={() => setShowSettingsModal(true)}>
              <Settings2 size={18} />
              <span>AI Provider Settings</span>
            </button>
            <button className="profile-row" onClick={logout}>
              <span className="avatar avatar-coral">{userInitials}</span>
              <span className="profile-copy">
                <strong>{userName}</strong>
                <small>Click to sign out</small>
              </span>
              <LogOut size={17} />
            </button>
          </div>
        )}
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>{userName}&apos;s workspace</span>
            <ChevronRight size={14} />
            <strong>
              {view === "overview"
                ? "Overview"
                : view === "guide"
                ? "The Guide"
                : view === "builder"
                ? "The Builder"
                : "The Analyzer"}
            </strong>
          </div>

          <div className="topbar-actions">
            <div className="provider-indicator" onClick={() => setShowSettingsModal(true)} title="Click to configure AI Provider">
              <span className={cn("status-dot", (aiProvider === 'gemini' ? aiStatus?.gemini?.available : aiStatus?.ollama?.available) ? "dot-online" : "dot-offline")} />
              <span>AI: {aiProvider === 'gemini' ? (aiStatus?.gemini?.model || 'Gemini') : (aiStatus?.ollama?.model || 'Ollama')}</span>
            </div>

            {papers.length > 1 && (
              <select
                className="paper-selector"
                value={activePaper?.id || ""}
                onChange={(e) => {
                  const p = papers.find((paper) => paper.id === e.target.value);
                  if (p) {
                    setActivePaper(p);
                    setPaperName(p.title || p.original_name);
                    setTitle(p.title || paperName);
                    setAbstract(p.abstract || "");
                  }
                }}
              >
                {papers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title || p.original_name}
                  </option>
                ))}
              </select>
            )}

            <button className="search-pill" onClick={() => navigate("analyzer")}>
              <Search size={16} />
              <span>Jump to Paper</span>
              <kbd>⌘ K</kbd>
            </button>
            <button className="avatar avatar-coral" onClick={logout} title="Sign Out">
              {userInitials}
            </button>
          </div>
        </header>

        <div className="page-content">
          {view === "overview" && (
            <OverviewView
              paperName={paperName}
              onContinue={() => navigate("analyzer")}
              onUpload={() => fileRef.current?.click()}
              onDropFile={handleDrop}
              isDragging={isDragging}
              isUploading={isUploading}
              uploadedFileName={uploadedFileName}
              setIsDragging={setIsDragging}
              onFileSelected={handleUpload}
              onNavigate={navigate}
              formatReady={formatReady}
              analysis={analysis}
            />
          )}
          {view === "guide" && (
            <GuideView onNavigate={navigate} paperId={activePaper?.id} />
          )}
          {view === "builder" && (
            <BuilderView
              paperName={paperName}
              title={title}
              setTitle={setTitle}
              abstract={abstract}
              setAbstract={setAbstract}
              formatReady={formatReady}
              onFormat={runFormat}
              onNavigate={navigate}
              onUpload={() => fileRef.current?.click()}
              onExport={handleExport}
              userName={userName}
              activePaper={activePaper}
            />
          )}
          {view === "analyzer" && (
            <AnalyzerView
              paperName={paperName}
              analyzerTab={analyzerTab}
              setAnalyzerTab={setAnalyzerTab}
              summary={summary}
              onRunSummary={runSummary}
              isSummarizing={isSummarizing}
              analysis={analysis}
              onRunAnalysis={runAnalysis}
              isAnalyzing={isAnalyzing}
              reviews={reviews}
              onRunReview={runReview}
              isReviewing={isReviewing}
              chat={chat}
              chatInput={chatInput}
              setChatInput={setChatInput}
              sendChat={sendChat}
              chatLoading={chatLoading}
              chatLoadingStep={chatLoadingStep}
              onNavigate={navigate}
              hasPaper={!!activePaper}
            />
          )}
        </div>
      </main>

      {/* AI Provider Settings Modal */}
      {showSettingsModal && (
        <div className="modal-backdrop" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <Cpu size={20} />
                <h3>AI Provider Settings</h3>
              </div>
              <IconButton label="Close" onClick={() => setShowSettingsModal(false)}>
                <X size={18} />
              </IconButton>
            </div>
            <p className="modal-desc">
              Choose the AI engine that powers summaries, 7-dimension quality auditing, reviewer simulation, and paper chat.
            </p>

            <div className="provider-options">
              <label className={cn("provider-card", aiProvider === 'gemini' && "provider-card-active")}>
                <input
                  type="radio"
                  name="provider"
                  value="gemini"
                  checked={aiProvider === 'gemini'}
                  onChange={() => handleProviderChange('gemini')}
                />
                <div className="provider-card-body">
                  <div className="provider-title-row">
                    <strong>Google Gemini ({aiStatus?.gemini?.model || 'gemini-flash-lite-latest'})</strong>
                    <span className={cn("badge", aiStatus?.gemini?.available ? "badge-success" : "badge-warn")}>
                      {aiStatus?.gemini?.available ? "Available" : "Missing Key"}
                    </span>
                  </div>
                  <p>Fast, high-accuracy cloud model via {aiStatus?.gemini?.model || 'Gemini'} API. Configured via <code>GEMINI_API_KEY</code>.</p>
                </div>
              </label>

              <label className={cn("provider-card", aiProvider === 'ollama' && "provider-card-active")}>
                <input
                  type="radio"
                  name="provider"
                  value="ollama"
                  checked={aiProvider === 'ollama'}
                  onChange={() => handleProviderChange('ollama')}
                />
                <div className="provider-card-body">
                  <div className="provider-title-row">
                    <strong>Local Ollama ({aiStatus?.ollama?.model || 'qwen3:4b-instruct'})</strong>
                    <span className={cn("badge", aiStatus?.ollama?.available ? "badge-success" : "badge-warn")}>
                      {aiStatus?.ollama?.available ? "Connected" : "Offline"}
                    </span>
                  </div>
                  <p>100% private local model ({aiStatus?.ollama?.model || 'qwen3:4b-instruct'}) running at <code>http://localhost:11434</code>.</p>
                </div>
              </label>
            </div>

            <div className="modal-footer">
              <PrimaryButton onClick={() => setShowSettingsModal(false)}>Done</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden-input" onChange={handleUpload} />
    </div>
  );
}


function OverviewView({
  paperName,
  formatReady,
  onContinue,
  onUpload,
  onDropFile,
  isDragging,
  isUploading,
  uploadedFileName,
  setIsDragging,
  onFileSelected,
  onNavigate,
  analysis,
}: {
  paperName: string;
  formatReady: boolean;
  onContinue: () => void;
  onUpload: () => void;
  onDropFile: (event: React.DragEvent<HTMLDivElement>) => void;
  isDragging: boolean;
  isUploading: boolean;
  uploadedFileName: string;
  setIsDragging: (value: boolean) => void;
  onFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onNavigate: (view: View) => void;
  analysis: api.AnalysisScore | null;
}) {
  const overallScore = analysis?.overall || 80;

  return (
    <div className="view-stack">
      <section className="hero-grid">
        <div className="hero-copy">
          <div className="status-pill">
            <span className="status-dot" /> ResearchLens Workspace
          </div>
          <h1>
            Make the paper
            <br />
            <em>the easy part.</em>
          </h1>
          <p className="hero-subtitle">
            One calm academic workspace from outline to peer-review. Extract, audit against IEEE standards, and export.
          </p>
          <div className="hero-actions">
            <PrimaryButton onClick={onContinue} icon={<ArrowUpRight size={17} strokeWidth={2.7} />}>
              Open Paper Analysis
            </PrimaryButton>
            <SoftButton onClick={onUpload} icon={<Upload size={16} />}>
              Upload Research PDF
            </SoftButton>
          </div>
        </div>
        <div className="hero-art" aria-label="ResearchLens Workflow Diagram">
          <div className="art-orbit orbit-large" />
          <div className="art-orbit orbit-small" />
          <div className="art-card art-card-main">
            <div className="paper-corner" />
            <span className="art-label">CURRENT DRAFT</span>
            <strong>{paperName.slice(0, 24)}...</strong>
            <div className="art-mini-line" />
            <div className="art-mini-line short" />
          </div>
          <div className="art-node node-guide"><BookOpen size={17} /><span>Guide</span></div>
          <div className="art-node node-builder"><WandSparkles size={17} /><span>Build</span></div>
          <div className="art-node node-analyzer"><Gauge size={17} /><span>Analyze</span></div>
        </div>
      </section>

      <UploadZone
        onUpload={onUpload}
        onDropFile={onDropFile}
        isDragging={isDragging}
        isUploading={isUploading}
        uploadedFileName={uploadedFileName}
        setIsDragging={setIsDragging}
        onFileSelected={onFileSelected}
      />

      <section className="section-block">
        <div className="section-heading-row">
          <div>
            <SectionEyebrow>THE RESEARCHLENS LOOP</SectionEyebrow>
            <h2>From rough draft to camera-ready IEEE paper.</h2>
          </div>
          <button className="text-button" onClick={() => onNavigate("guide")}>
            Read the IEEE Guide <ArrowRight size={15} />
          </button>
        </div>
        <div className="flow-grid">
          <FlowCard
            number="01"
            tone="coral"
            icon={<BookOpen size={21} />}
            title="The Guide"
            text="Official IEEE Author Center manual: learn paper structure, literature mapping, and submission checklists."
            action="Open Guide Manual"
            onClick={() => onNavigate("guide")}
            meta="10 chapters"
          />
          <div className="flow-connector"><ArrowRight size={19} /><span>shape</span></div>
          <FlowCard
            number="02"
            tone="mango"
            icon={<WandSparkles size={21} />}
            title="The Builder"
            text="Shape notes into standard two-column IEEE layout. Export to LaTeX, Word DOCX, or Markdown."
            action="Open IEEE Builder"
            onClick={() => onNavigate("builder")}
            meta={formatReady ? "IEEE aligned" : "Draft mode"}
          />
          <div className="flow-connector"><ArrowRight size={19} /><span>sharpen</span></div>
          <FlowCard
            number="03"
            tone="mint"
            icon={<Gauge size={21} />}
            title="The Analyzer"
            text="7-dimension quality scorecard, simulated conference reviewer critique, smart summary, and grounded chat."
            action="Open Analyzer"
            onClick={() => onNavigate("analyzer")}
            meta="4 tools"
          />
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel progress-panel">
          <div className="panel-top">
            <div>
              <SectionEyebrow>SUBMISSION HEALTH</SectionEyebrow>
              <h3>{paperName}</h3>
            </div>
          </div>
          <div className="big-progress-row">
            <div className="big-progress">
              <span>{overallScore}%</span>
              <small>Quality Score</small>
            </div>
            <div className="progress-copy">
              <p>Paper parsed and indexed. Evaluate your methodology and baselines in the Analyzer.</p>
              <button className="text-button" onClick={() => onNavigate("analyzer")}>
                See 7-Dimension Score <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="panel insight-panel">
          <div className="insight-icon"><Sparkles size={20} /></div>
          <SectionEyebrow>OFFICIAL IEEE GUIDANCE</SectionEyebrow>
          <h3>Lead with the problem gap.</h3>
          <p>IEEE conference guidelines recommend stating the specific research limitation before introducing the proposed system.</p>
          <button className="insight-link" onClick={() => onNavigate("guide")}>
            Read Section IV Guide <ArrowUpRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
}


function UploadZone({
  onUpload,
  onDropFile,
  isDragging,
  isUploading,
  uploadedFileName,
  setIsDragging,
  onFileSelected,
}: {
  onUpload: () => void;
  onDropFile: (event: React.DragEvent<HTMLDivElement>) => void;
  isDragging: boolean;
  isUploading: boolean;
  uploadedFileName: string;
  setIsDragging: (value: boolean) => void;
  onFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <section
      className={cn("upload-zone", isDragging && "upload-zone-dragging", isUploading && "upload-zone-loading")}
      onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      onDrop={onDropFile}
      onClick={onUpload}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onUpload(); }}
      aria-label="Upload PDF research paper"
    >
      <input className="upload-file-picker" type="file" accept="application/pdf,.pdf" aria-label="Upload PDF" onClick={(e) => e.stopPropagation()} onChange={onFileSelected} />
      <div className="upload-zone-icon">
        {isUploading ? <Loader2 size={22} className="spin-icon" /> : <Upload size={22} />}
      </div>
      <div className="upload-zone-copy">
        <div className="upload-zone-heading">
          {isUploading ? "Extracting text, sections, and chunks…" : "Drop a research PDF here"}
        </div>
        <p>PDF only · Max 10 MB · Automatically chunked and indexed for RAG</p>
        {uploadedFileName && !isUploading && (
          <span className="upload-file-meta"><CheckCircle2 size={14} /> {uploadedFileName}</span>
        )}
      </div>
      <span className="upload-zone-arrow"><ArrowUpRight size={18} /></span>
    </section>
  );
}

function FlowCard({ number, tone, icon, title, text, action, onClick, meta }: { number: string; tone: string; icon: React.ReactNode; title: string; text: string; action: string; onClick: () => void; meta: string }) {
  return (
    <article className={cn("flow-card", `flow-${tone}`)}>
      <div className="flow-card-top">
        <span className="flow-number">{number}</span>
        <span className="flow-icon">{icon}</span>
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      <div className="flow-card-bottom">
        <button className="card-link" onClick={onClick}>{action} <ArrowUpRight size={15} /></button>
        <span className="card-meta">{meta}</span>
      </div>
    </article>
  );
}


const guideChapters = [
  {
    page: 1,
    title: "What is a Research Paper?",
    eyebrow: "FOUNDATIONS / 01",
    summary: "Understanding the academic lifecycle and what distinguishes a research paper from an essay.",
    content: `A scientific research paper is a formal, peer-reviewed document designed to share original findings with the global academic community.

Unlike a class essay or summary, a research paper must contribute **new knowledge**: a new algorithm, a novel empirical discovery, a benchmark comparison, or an original synthesis that solves an open problem.

**The Academic Paper Lifecycle:**
1. **Problem Discovery:** Identifying an unanswered question or gap in existing systems.
2. **Investigation & Methodology:** Designing a reproducible experiment or proof.
3. **Drafting & IEEE Structuring:** Writing in standardized two-column format.
4. **Peer Review:** Anonymous evaluation by 2–4 expert reviewers.
5. **Camera-Ready Publication:** Final revisions and indexing in digital libraries like IEEE Xplore.`,
    checklist: [
      "I have identified an unanswered question or engineering problem.",
      "My contribution is distinct from general tutorial summaries.",
      "I am preparing to write for peer reviewers in my domain.",
    ],
    sources: [
      { title: "IEEE Author Center — Publishing Basics", url: "https://ieeeauthorcenter.ieee.org/" },
      { title: "IEEE PSPB Operations Manual", url: "https://www.ieee.org/about/help/structure-and-governance.html" }
    ]
  },
  {
    page: 2,
    title: "Choosing a Research Topic",
    eyebrow: "TOPIC SELECTION / 02",
    summary: "How to narrow broad interests into an achievable, researchable scope.",
    content: `Good research begins with a tight, well-defined scope. Broad topics like "AI in Healthcare" lead to vague claims; specific questions like "Evaluating Low-Latency Reranking for Dense Retrieval on Clinical Notes" yield clear, testable hypotheses.

**Criteria for a Viable Paper Topic:**
* **Feasibility:** Can you collect data or run experiments within your timeframe?
* **Novelty:** Does it offer something new beyond existing IEEE conference baselines?
* **Measurability:** Are there objective metrics (e.g. Accuracy, F1, Latency, BLEU) to prove success?`,
    checklist: [
      "My topic is narrowed down to a specific problem setting.",
      "I have identified standard evaluation metrics to measure results.",
      "I have access to necessary datasets and compute resources.",
    ],
    sources: [
      { title: "IEEE Author Center — Selecting a Topic", url: "https://ieeeauthorcenter.ieee.org/create-your-ieee-article/" }
    ]
  },
  {
    page: 3,
    title: "Literature Review & Gap Mapping",
    eyebrow: "LITERATURE / 03",
    summary: "Systematically searching IEEE Xplore, arXiv, and Google Scholar to pinpoint the research gap.",
    content: `A literature review is a structured conversation between existing work and your proposed contribution. It shows where the field agrees, where it falls short, and why your paper is needed.

**How to Read & Map Papers:**
1. **First Pass (10 mins):** Read Title, Abstract, Figures, and Conclusion to determine relevance.
2. **Second Pass:** Analyze the Methodology and Baseline comparisons.
3. **Synthesize the Gap:** State explicitly: "While Author A [1] and Author B [2] improved retrieval accuracy, their approaches require high compute overhead, leaving low-power devices unaddressed."`,
    checklist: [
      "I have gathered at least 10–15 recent peer-reviewed references.",
      "I have categorized papers into distinct baseline approaches.",
      "I have stated the exact limitation of existing work.",
    ],
    sources: [
      { title: "IEEE Xplore Digital Library", url: "https://ieeexplore.ieee.org/" },
      { title: "IEEE Reference Guide", url: "https://ieeeauthorcenter.ieee.org/wp-content/uploads/IEEE-Reference-Guide.pdf" }
    ]
  },
  {
    page: 4,
    title: "Research Questions & Problem Statements",
    eyebrow: "PROBLEM DEFINITION / 04",
    summary: "Formulating crisp research questions (RQs) and testable hypotheses.",
    content: `Your problem statement is the backbone of your manuscript. Reviewers immediately look for explicit Research Questions (RQs) in Section I (Introduction).

**Effective RQ Examples:**
* **RQ1:** Does integrating cross-encoder reranking improve Top-5 retrieval precision on student queries?
* **RQ2:** What is the computational tradeoff between chunk size and latency on resource-constrained devices?

Each experiment and results table in your paper must directly answer one of your defined RQs.`,
    checklist: [
      "My paper clearly defines 1–3 explicit Research Questions (RQs).",
      "Each RQ is directly tied to an experiment or measurement in Section IV.",
    ],
    sources: [
      { title: "IEEE Author Center — Article Structure", url: "https://ieeeauthorcenter.ieee.org/create-your-ieee-article/authoring-tools-and-templates/" }
    ]
  },
  {
    page: 5,
    title: "Methodology & Reproducibility",
    eyebrow: "METHODOLOGY / 05",
    summary: "Writing Section III so an independent engineer can reproduce your exact system.",
    content: `IEEE peer reviewers place the highest weight on methodological rigor and reproducibility. 

**Essential Elements of Section III:**
1. **System Architecture Diagram:** A clear flowchart showing data ingestion, processing, and output.
2. **Formal Problem Formulation:** Mathematical notation defining inputs (X), operations (f), and targets (Y).
3. **Implementation Details:** Exact parameters, learning rates, embedding models, and hardware specifications.`,
    checklist: [
      "All mathematical variables are explicitly defined after formulas.",
      "Pipeline architecture is illustrated with a numbered diagram.",
      "Hyperparameters, datasets, and runtime environments are listed.",
    ],
    sources: [
      { title: "IEEE Author Center — Guidelines for Submitting Data", url: "https://ieeeauthorcenter.ieee.org/" }
    ]
  },
  {
    page: 6,
    title: "Experiments & Results Reporting",
    eyebrow: "EXPERIMENTS / 06",
    summary: "Designing benchmark tables, ablation studies, and avoiding overclaiming.",
    content: `Your experimental evaluation must prove your claims without exaggeration.

**Key Experimental Requirements:**
* **Strong Baselines:** Compare against standard existing approaches (e.g. BM25, Vanilla RAG), not just a weaker version of your own tool.
* **Ablation Studies:** Systematically disable individual components to prove which part actually drives the performance gain.
* **Statistical Significance:** Include standard deviations or p-values across multiple runs.`,
    checklist: [
      "I have compared my system against at least 2 published baselines.",
      "I included an ablation study isolating individual components.",
      "Every table and figure has a self-contained caption explaining the result.",
    ],
    sources: [
      { title: "IEEE Editorial Style Manual", url: "https://www.ieee.org/content/dam/ieee-org/ieee/web/org/conferences/style_manual.pdf" }
    ]
  },
  {
    page: 7,
    title: "Writing Order & Section Anatomy",
    eyebrow: "MANUSCRIPT ANATOMY / 07",
    summary: "The recommended order of drafting to avoid writer's block.",
    content: `Never write a paper from Title to References in linear order. Experienced researchers draft in this sequence:

**Recommended Writing Order:**
1. **Methods & System Architecture:** Write what you built while it's fresh.
2. **Experiments & Results Tables:** Generate all tables and figures.
3. **Introduction & Related Work:** Frame the problem around the results you achieved.
4. **Conclusion & Discussion:** Synthesize takeaways and limitations.
5. **Abstract & Title:** Write last to summarize the finished manuscript accurately.`,
    checklist: [
      "Drafted Methods and Results before finalizing the Introduction.",
      "Abstract contains Background, Problem, Method, Key Metric Result, and Conclusion in under 200 words.",
    ],
    sources: [
      { title: "IEEE Author Center — Structuring Your Article", url: "https://ieeeauthorcenter.ieee.org/" }
    ]
  },
  {
    page: 8,
    title: "Official IEEE Format & Citation Rules",
    eyebrow: "IEEE FORMATTING / 08",
    summary: "Two-column conference layout, numbering, equation formatting, and citation style.",
    content: `IEEE conference papers follow strict layout rules defined by official IEEE templates.

**Official IEEE Layout Rules:**
* **Two-Column Layout:** Standard 8.5" x 11" page with 0.75" margins.
* **Author Block:** Names, affiliations, departments, and emails below the title.
* **Abstract & Index Terms:** Single column paragraph immediately before Section I.
* **Numbered Headings:** Roman numerals for major sections (\`I. INTRODUCTION\`, \`II. RELATED WORK\`).
* **Numbered Citations:** Enclosed in square brackets inline (e.g. \`[1]\`, \`[2], [3]\`), matching the alphabetical/appearance order in References.

**Example IEEE References:**
* **Conference Paper:** [1] A. Author and B. Author, "Title of paper," in *Proc. IEEE Conf. Comput. Vision Pattern Recognit. (CVPR)*, 2024, pp. 100–108.
* **Journal Paper:** [2] C. Author, "Article title," *IEEE Trans. Pattern Anal. Mach. Intell.*, vol. 46, no. 2, pp. 200–215, Feb. 2024.`,
    checklist: [
      "Using two-column conference format.",
      "Citations formatted as numbered brackets [1], [2].",
      "Index Terms (keywords) listed below abstract.",
    ],
    sources: [
      { title: "IEEE Conference Publishing Templates", url: "https://www.ieee.org/conferences/publishing/templates.html" },
      { title: "IEEE Reference Guide (Official PDF)", url: "https://ieeeauthorcenter.ieee.org/wp-content/uploads/IEEE-Reference-Guide.pdf" }
    ]
  },
  {
    page: 9,
    title: "Common Mistakes, Plagiarism & Ethics",
    eyebrow: "ETHICS & INTEGRITY / 09",
    summary: "Avoiding peer review rejection due to citation issues, unverified claims, or formatting violations.",
    content: `Top reasons papers are rejected at IEEE conferences:

**Common Rejection Pitfalls:**
1. **Unsubstantiated Overclaiming:** Claiming your method "outperforms all existing AI" without benchmarking standard datasets.
2. **Missing Citations & Plagiarism:** Copying sentences verbatim without quotes or attribution. IEEE checks submissions with automated cross-checks.
3. **Unexplained Variables:** Using math symbols without defining them in the text.
4. **Poor Figure Resolution:** Blurry graphs with unreadable axis labels.`,
    checklist: [
      "All text is original or properly cited.",
      "Figures are high-resolution (300 DPI vector/PNG) with clear font sizes.",
      "Limitations are transparently addressed in the Discussion section.",
    ],
    sources: [
      { title: "IEEE Plagiarism Guidelines & Policies", url: "https://www.ieee.org/publications/rights/plagiarism/plagiarism.html" }
    ]
  },
  {
    page: 10,
    title: "Final Submission Checklist",
    eyebrow: "SUBMISSION READINESS / 10",
    summary: "Interactive pre-flight checklist before submitting to IEEE conference portals.",
    content: `Complete this final pre-submission audit before uploading your camera-ready PDF or LaTeX source.`,
    checklist: [
      "Research question and problem statement explicitly stated in Section I.",
      "Literature review cites relevant peer-reviewed papers from IEEE Xplore.",
      "Methodology contains complete architectural details and math definitions.",
      "Experimental results compared against standard published baselines.",
      "Ablation studies included to isolate component contributions.",
      "All figures and tables have numbered captions and are referenced in text.",
      "Equations are numbered consecutively with parentheses: (1), (2).",
      "References conform to IEEE numbered citation format [1], [2].",
      "Spelling, grammar, and IEEE two-column template constraints verified.",
      "Final PDF generated and verified for font embedding.",
    ],
    sources: [
      { title: "IEEE Author Center — Pre-Submission Checklist", url: "https://ieeeauthorcenter.ieee.org/" }
    ]
  }
];

function GuideView({ onNavigate, paperId }: { onNavigate: (view: View) => void; paperId?: string }) {
  const [activePage, setActivePage] = useState(1);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [isAiAsking, setIsAiAsking] = useState(false);

  const chapter = guideChapters[activePage - 1];

  useEffect(() => {
    const saved = localStorage.getItem("researchlens_guide_checklist");
    if (saved) {
      try { setCheckedItems(JSON.parse(saved)); } catch {}
    }
  }, []);

  const toggleCheck = (item: string) => {
    const next = { ...checkedItems, [item]: !checkedItems[item] };
    setCheckedItems(next);
    localStorage.setItem("researchlens_guide_checklist", JSON.stringify(next));
  };

  const handleAskAiAboutPage = async () => {
    if (!aiQuestion.trim() || isAiAsking) return;
    setIsAiAsking(true);
    setAiAnswer("");
    try {
      if (paperId) {
        const prompt = `Based on IEEE Guide Chapter ${chapter.page}: "${chapter.title}" and the paper context, answer this question: ${aiQuestion}`;
        const res = await api.sendChatMessage(paperId, prompt);
        setAiAnswer(res.text);
      } else {
        setAiAnswer(`For Chapter ${chapter.page} (${chapter.title}): ${chapter.summary} Review the checklist and apply standard IEEE conference specifications.`);
      }
    } catch (err: any) {
      setAiAnswer(`Guidance for ${chapter.title}: Consult the official IEEE Author Center references linked below.`);
    } finally {
      setIsAiAsking(false);
    }
  };

  return (
    <div className="view-stack compact-stack">
      <section className="page-intro">
        <div>
          <SectionEyebrow>OFFICIAL IEEE RESEARCH GUIDE</SectionEyebrow>
          <h1>Learn the shape<br /><em>of a published paper.</em></h1>
          <p>A 10-chapter beginner handbook grounded in official IEEE Author Center standards and conference templates.</p>
        </div>
        <div className="intro-aside">
          <span className="progress-bubble">
            {String(activePage).padStart(2, "0")} <small>/ 10</small>
          </span>
          <span>Chapter</span>
        </div>
      </section>

      <div className="guide-layout">
        {/* Table of Contents Rail */}
        <aside className="guide-rail">
          <div className="guide-rail-label">TABLE OF CONTENTS</div>
          {guideChapters.map((chap) => {
            const active = chap.page === activePage;
            return (
              <button
                key={chap.page}
                className={cn("guide-step", active && "guide-step-active")}
                onClick={() => {
                  setActivePage(chap.page);
                  setAiAnswer("");
                  setAiQuestion("");
                }}
              >
                <span className="guide-step-icon">{chap.page}</span>
                <span>
                  <strong>{chap.title}</strong>
                  <small>{chap.eyebrow}</small>
                </span>
                {active && <ChevronRight size={15} />}
              </button>
            );
          })}
        </aside>

        {/* Chapter Reader Card */}
        <section className="guide-card">
          <div className="guide-card-top">
            <span className="step-chip">{chapter.eyebrow}</span>
            <span className="save-state">
              <BookOpen size={14} /> Page {chapter.page} of 10
            </span>
          </div>

          <div className="chapter-body">
            <h2>{chapter.title}</h2>
            <p className="chapter-summary">{chapter.summary}</p>
            <div className="chapter-content-text">
              {chapter.content.split("\n\n").map((para, i) => (
                <p key={i} dangerouslySetInnerHTML={{ __html: para.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>') }} />
              ))}
            </div>

            {/* Checklist */}
            <div className="chapter-checklist-box">
              <span className="micro-label">CHAPTER CHECKLIST</span>
              <div className="checklist-items">
                {chapter.checklist.map((item) => (
                  <label key={item} className="checklist-row">
                    <input
                      type="checkbox"
                      checked={!!checkedItems[item]}
                      onChange={() => toggleCheck(item)}
                    />
                    <span className={cn(checkedItems[item] && "item-checked")}>{item}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Ask AI about this page */}
            <div className="guide-ai-box">
              <div className="guide-ai-input-row">
                <input
                  type="text"
                  placeholder={`Ask AI about ${chapter.title}…`}
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAskAiAboutPage()}
                  disabled={isAiAsking}
                />
                <button onClick={handleAskAiAboutPage} disabled={isAiAsking || !aiQuestion.trim()}>
                  {isAiAsking ? <Loader2 size={16} className="spin-icon" /> : <Send size={16} />}
                </button>
              </div>
              {aiAnswer && (
                <div className="guide-ai-response">
                  <Bot size={16} />
                  <p>{aiAnswer}</p>
                </div>
              )}
            </div>

            {/* Official Sources Footer */}
            <div className="chapter-sources-footer">
              <span className="micro-label">OFFICIAL SOURCES & VERIFIED REFERENCES</span>
              <div className="sources-list">
                {chapter.sources.map((src, i) => (
                  <a key={i} href={src.url} target="_blank" rel="noreferrer" className="source-link">
                    <ExternalLink size={13} />
                    <span>{src.title}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="guide-card-bottom">
            <button
              className="back-button"
              onClick={() => setActivePage(Math.max(1, activePage - 1))}
              disabled={activePage === 1}
            >
              <ArrowLeft size={16} /> Previous
            </button>
            <div className="guide-progress-dots">
              {guideChapters.map((_, i) => (
                <span key={i} className={cn(i + 1 === activePage && "active", i + 1 < activePage && "done")} />
              ))}
            </div>
            {activePage < 10 ? (
              <PrimaryButton onClick={() => setActivePage(activePage + 1)}>
                Next Page
              </PrimaryButton>
            ) : (
              <PrimaryButton onClick={() => onNavigate("builder")} icon={<WandSparkles size={16} />}>
                Open Builder
              </PrimaryButton>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}


function BuilderView({
  paperName,
  title,
  setTitle,
  abstract,
  setAbstract,
  formatReady,
  onFormat,
  onNavigate,
  onUpload,
  onExport,
  userName,
  activePaper,
}: {
  paperName: string;
  title: string;
  setTitle: (value: string) => void;
  abstract: string;
  setAbstract: (value: string) => void;
  formatReady: boolean;
  onFormat: () => void;
  onNavigate: (view: View) => void;
  onUpload: () => void;
  onExport: (format: "latex" | "docx" | "markdown") => void;
  userName: string;
  activePaper: api.Paper | null;
}) {
  const [activeSection, setActiveSection] = useState("Abstract");
  const [authors, setAuthors] = useState(userName);
  const [keywords, setKeywords] = useState("information retrieval, RAG, natural language processing, IEEE conference");
  const [sourceData, setSourceData] = useState("");
  const [showExport, setShowExport] = useState(false);

  const sections = [
    "Title",
    "Abstract",
    "Index Terms",
    "I. Introduction",
    "II. Related Work",
    "III. Methodology",
    "IV. Experiments",
    "V. Results",
    "VI. Conclusion",
    "References",
  ];

  useEffect(() => {
    if (activePaper?.content_text) {
      setSourceData(activePaper.content_text.slice(0, 3000));
    }
  }, [activePaper]);

  return (
    <div className="view-stack compact-stack">
      <section className="page-intro builder-intro">
        <div>
          <SectionEyebrow>THE BUILDER / 02</SectionEyebrow>
          <h1>
            IEEE Manuscript<br /><em>Studio.</em>
          </h1>
          <p>
            Shape raw notes or extracted PDF text into an IEEE-compliant two-column structure. Export to LaTeX, Word DOCX, or Markdown.
          </p>
        </div>
        <div className="builder-actions">
          <SoftButton onClick={onUpload} icon={<Upload size={16} />}>
            Replace PDF
          </SoftButton>
          <div className="export-group">
            <button className="export-toggle" onClick={() => setShowExport(!showExport)}>
              <Download size={16} /> Export Draft <ChevronDown size={14} />
            </button>
            {showExport && (
              <div className="export-dropdown">
                <button onClick={() => { onExport("latex"); setShowExport(false); }}>
                  <FileText size={15} /> LaTeX (.tex - IEEEtran)
                </button>
                <button onClick={() => { onExport("docx"); setShowExport(false); }}>
                  <FileText size={15} /> Word (.docx)
                </button>
                <button onClick={() => { onExport("markdown"); setShowExport(false); }}>
                  <FileText size={15} /> Markdown (.md)
                </button>
              </div>
            )}
          </div>
          <PrimaryButton onClick={onFormat} icon={<WandSparkles size={16} />}>
            {formatReady ? "IEEE Aligned" : "Apply IEEE Format"}
          </PrimaryButton>
        </div>
      </section>

      <div className="builder-toolbar">
        <div className="doc-identity">
          <span className="file-icon"><FileText size={17} /></span>
          <div>
            <strong>{paperName}</strong>
            <small>IEEE Conference Draft · Autosaved to SQLite</small>
          </div>
        </div>
        <div className="toolbar-status">
          <span className={cn("format-status", formatReady && "is-ready")}>
            <span className="status-dot" /> {formatReady ? "IEEE Structure Validated" : "Draft Mode"}
          </span>
        </div>
      </div>

      <div className="builder-layout">
        {/* Sections Outline */}
        <aside className="outline-panel">
          <div className="outline-heading">
            <span>IEEE SECTIONS</span>
          </div>
          <div className="outline-list">
            {sections.map((section, index) => (
              <button
                key={section}
                className={cn("outline-item", activeSection === section && "active")}
                onClick={() => setActiveSection(section)}
              >
                <span className="outline-index">{String(index + 1).padStart(2, "0")}</span>
                <span>{section}</span>
                {index < 3 && <Check size={14} className="outline-check" />}
              </button>
            ))}
          </div>
        </aside>

        {/* Paper Editor Page */}
        <section className="editor-panel">
          <div className="editor-top">
            <div>
              <span className="micro-label">ACTIVE SECTION</span>
              <h2>{activeSection}</h2>
            </div>
          </div>
          <div className="paper-editor">
            <div className="paper-page">
              <div className="paper-header">
                <span>IEEE CONFERENCE DRAFT</span>
                <span>02</span>
              </div>
              <input
                className="paper-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter Paper Title…"
                aria-label="Paper title"
              />
              <input
                className="paper-author-input"
                value={authors}
                onChange={(e) => setAuthors(e.target.value)}
                placeholder="Author Name(s), Department, Institution…"
                aria-label="Paper authors"
              />
              <div className="paper-rule" />
              <div className="paper-heading">Abstract</div>
              <textarea
                className="paper-abstract-input"
                value={abstract}
                onChange={(e) => setAbstract(e.target.value)}
                placeholder="Under 200 words summarizing problem, method, results…"
                aria-label="Paper abstract"
              />
              <div className="paper-heading">Index Terms—</div>
              <input
                className="paper-keywords-input"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="keyword1, keyword2, keyword3…"
                aria-label="Paper index terms"
              />
              <div className="paper-heading">I. Introduction</div>
              <p className="paper-paragraph">
                {activePaper?.sections?.find((s) => /intro/i.test(s.heading))?.content ||
                  "State the context, research problem, gap, and summary of contributions."}
              </p>
              <div className="paper-heading">II. Related Work</div>
              <p className="paper-paragraph muted-paragraph">
                {activePaper?.sections?.find((s) => /related|literature/i.test(s.heading))?.content ||
                  "Review published IEEE baselines and categorize prior literature."}
              </p>
              <div className="paper-heading">III. Methodology</div>
              <p className="paper-paragraph muted-paragraph">
                {activePaper?.sections?.find((s) => /method|approach|system/i.test(s.heading))?.content ||
                  "Describe the algorithm, data pipeline, and system architecture."}
              </p>
              <div className="paper-heading">IV. Experiments</div>
              <p className="paper-paragraph muted-paragraph">
                {activePaper?.sections?.find((s) => /experiment/i.test(s.heading))?.content ||
                  "Specify datasets, metrics, hardware setup, and baseline comparisons."}
              </p>
              <div className="paper-heading">V. Results</div>
              <p className="paper-paragraph muted-paragraph">
                {activePaper?.sections?.find((s) => /result|eval/i.test(s.heading))?.content ||
                  "Report numerical findings, ablation studies, and analysis."}
              </p>
              <div className="paper-heading">VI. Conclusion</div>
              <p className="paper-paragraph muted-paragraph">
                {activePaper?.sections?.find((s) => /conclusion/i.test(s.heading))?.content ||
                  "Synthesize key contributions and future research directions."}
              </p>
              <div className="paper-heading">References</div>
              <p className="paper-paragraph muted-paragraph">
                {activePaper?.sections?.find((s) => /ref/i.test(s.heading))?.content ||
                  "[1] Author Name, 'Title of Paper,' in Proc. IEEE Conference, 2024, pp. 1–8."}
              </p>
            </div>
          </div>
        </section>

        {/* Live Status & CTA */}
        <aside className="preview-panel">
          <div className="preview-heading">
            <span>IEEE CHECKS</span>
            <span className="live-dot"><span /> valid</span>
          </div>
          <div className="check-card check-good">
            <CheckCircle2 size={17} />
            <div>
              <strong>Sections Aligned</strong>
              <p>Standard IEEE sequence verified.</p>
            </div>
          </div>
          <button className="analyzer-cta" onClick={() => onNavigate("analyzer")}>
            <span>
              <Gauge size={18} />
              <span>
                <strong>Run 7-Dimension Audit</strong>
                <small>Score problem, methods, evidence.</small>
              </span>
            </span>
            <ArrowUpRight size={17} />
          </button>
        </aside>
      </div>
    </div>
  );
}


function AnalyzerView({
  paperName,
  analyzerTab,
  setAnalyzerTab,
  summary,
  onRunSummary,
  isSummarizing,
  analysis,
  onRunAnalysis,
  isAnalyzing,
  reviews,
  onRunReview,
  isReviewing,
  chat,
  chatInput,
  setChatInput,
  sendChat,
  chatLoading,
  chatLoadingStep,
  onNavigate,
  hasPaper,
}: {
  paperName: string;
  analyzerTab: AnalyzerTab;
  setAnalyzerTab: (value: AnalyzerTab) => void;
  summary: api.PaperSummary | null;
  onRunSummary: () => void;
  isSummarizing: boolean;
  analysis: api.AnalysisScore | null;
  onRunAnalysis: () => void;
  isAnalyzing: boolean;
  reviews: api.Review[];
  onRunReview: () => void;
  isReviewing: boolean;
  chat: api.ChatMessage[];
  chatInput: string;
  setChatInput: (value: string) => void;
  sendChat: (preset?: string) => void;
  chatLoading: boolean;
  chatLoadingStep: "searching" | "generating";
  onNavigate: (view: View) => void;
  hasPaper: boolean;
}) {
  return (
    <div className="view-stack compact-stack">
      <section className="page-intro analyzer-intro">
        <div>
          <SectionEyebrow>THE ANALYZER / 03</SectionEyebrow>
          <h1>
            Academic Quality &<br /><em>Review Suite.</em>
          </h1>
          <p>Four interconnected tools: Smart Summary, 7-Dimension Scorecard, Simulated Peer Review, and Grounded Paper Chat.</p>
        </div>
        <div className="analysis-meta">
          <span className="status-pill">
            <span className="status-dot" /> {paperName}
          </span>
        </div>
      </section>

      <div className="analyzer-tabs" role="tablist">
        <button className={cn(analyzerTab === "summary" && "active")} onClick={() => setAnalyzerTab("summary")}>
          <Sparkles size={16} /> Smart Summary
        </button>
        <button className={cn(analyzerTab === "scorecard" && "active")} onClick={() => setAnalyzerTab("scorecard")}>
          <Gauge size={16} /> Quality Scorecard
        </button>
        <button className={cn(analyzerTab === "reviewer" && "active")} onClick={() => setAnalyzerTab("reviewer")}>
          <UsersRound size={16} /> Reviewer Mode
        </button>
        <button className={cn(analyzerTab === "chat" && "active")} onClick={() => setAnalyzerTab("chat")}>
          <MessageCircle size={16} /> Chat with Paper
        </button>
      </div>

      {analyzerTab === "summary" && (
        <SummaryView
          summary={summary}
          onRunSummary={onRunSummary}
          isSummarizing={isSummarizing}
          hasPaper={hasPaper}
        />
      )}
      {analyzerTab === "scorecard" && (
        <ScorecardView
          onNavigate={onNavigate}
          analysis={analysis}
          onRunAnalysis={onRunAnalysis}
          isAnalyzing={isAnalyzing}
          hasPaper={hasPaper}
        />
      )}
      {analyzerTab === "reviewer" && (
        <ReviewerView
          reviews={reviews}
          onRunReview={onRunReview}
          isReviewing={isReviewing}
          hasPaper={hasPaper}
        />
      )}
      {analyzerTab === "chat" && (
        <ChatView
          chat={chat}
          chatInput={chatInput}
          setChatInput={setChatInput}
          sendChat={sendChat}
          chatLoading={chatLoading}
          chatLoadingStep={chatLoadingStep}
        />
      )}
    </div>
  );
}


function SummaryView({
  summary,
  onRunSummary,
  isSummarizing,
  hasPaper,
}: {
  summary: api.PaperSummary | null;
  onRunSummary: () => void;
  isSummarizing: boolean;
  hasPaper: boolean;
}) {
  const [showDetailed, setShowDetailed] = useState(false);

  if (!hasPaper) {
    return (
      <div className="analyzer-grid">
        <div className="panel score-panel empty-state-box">
          <Upload size={38} />
          <h3>Upload a paper to generate summary</h3>
          <p>Extract a PDF from the Overview page to create executive summaries and section digests.</p>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="analyzer-grid">
        <div className="panel score-panel empty-state-box">
          <Sparkles size={38} />
          <h3>Generate Smart Summary</h3>
          <p>Extracts one-line takeaways, executive briefs, detailed methodology summaries, and section breakdowns.</p>
          <PrimaryButton onClick={onRunSummary} disabled={isSummarizing} icon={isSummarizing ? <Loader2 size={16} className="spin-icon" /> : <Sparkles size={16} />}>
            {isSummarizing ? "Summarizing Paper…" : "Generate Summary"}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="summary-layout">
      {summary.is_fallback && <FallbackBadge />}

      {/* One-line & Executive Card */}
      <section className="panel summary-card">
        <div className="panel-top">
          <div>
            <SectionEyebrow>ONE-LINE TAKEAWAY</SectionEyebrow>
            <h3>{summary.one_line}</h3>
          </div>
          <SoftButton onClick={onRunSummary} disabled={isSummarizing} icon={isSummarizing ? <Loader2 size={14} className="spin-icon" /> : <RotateCcw size={14} />}>
            Regenerate
          </SoftButton>
        </div>

        <div className="summary-block">
          <SectionEyebrow>EXECUTIVE SUMMARY</SectionEyebrow>
          <p className="executive-text">{summary.executive}</p>
        </div>

        <div className="summary-block">
          <div className="detailed-toggle-row">
            <SectionEyebrow>DETAILED ACADEMIC SUMMARY</SectionEyebrow>
            <button className="text-button" onClick={() => setShowDetailed(!showDetailed)}>
              {showDetailed ? "Show less" : "Show full details"}
            </button>
          </div>
          {showDetailed && <p className="detailed-text">{summary.detailed}</p>}
        </div>
      </section>

      {/* Section-by-Section Summaries */}
      <section className="panel section-summaries-card">
        <SectionEyebrow>SECTION DIGESTS</SectionEyebrow>
        <h3>Extracted Sections</h3>
        <div className="section-summary-grid">
          {Object.entries(summary.sections || {}).map(([sec, text]) => (
            <div key={sec} className="section-summary-item">
              <strong>{sec}</strong>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}


function ScorecardView({
  onNavigate,
  analysis,
  onRunAnalysis,
  isAnalyzing,
  hasPaper,
}: {
  onNavigate: (view: View) => void;
  analysis: api.AnalysisScore | null;
  onRunAnalysis: () => void;
  isAnalyzing: boolean;
  hasPaper: boolean;
}) {
  if (!hasPaper) {
    return (
      <div className="analyzer-grid">
        <div className="panel score-panel empty-state-box">
          <Upload size={38} />
          <h3>Upload a paper to run quality audit</h3>
          <p>The analyzer needs an uploaded PDF to compute 7-dimension scores.</p>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="analyzer-grid">
        <div className="panel score-panel empty-state-box">
          <Gauge size={38} />
          <h3>Run 7-Dimension Quality Audit</h3>
          <p>Audits Problem Statement, Literature Review, Methodology, Experiments, Results, Conclusion, and References.</p>
          <PrimaryButton onClick={onRunAnalysis} disabled={isAnalyzing} icon={isAnalyzing ? <Loader2 size={16} className="spin-icon" /> : <Gauge size={16} />}>
            {isAnalyzing ? "Auditing Manuscript…" : "Run Quality Audit"}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  const dimensions = [
    { name: "Problem Statement", score: analysis.problem_statement, reason: analysis.reasons?.problem_statement || "Clear research gap." },
    { name: "Literature Review", score: analysis.literature_review, reason: analysis.reasons?.literature_review || "Coverage of baselines." },
    { name: "Methodology", score: analysis.methodology, reason: analysis.reasons?.methodology || "Pipeline reproducibility." },
    { name: "Experiments", score: analysis.experiments, reason: analysis.reasons?.experiments || "Ablation and testing protocol." },
    { name: "Results", score: analysis.results, reason: analysis.reasons?.results || "Evidence validation." },
    { name: "Conclusion", score: analysis.conclusion, reason: analysis.reasons?.conclusion || "Takeaway synthesis." },
    { name: "References", score: analysis.references, reason: analysis.reasons?.references || "IEEE citation formatting." },
  ];

  const overall = analysis.overall;
  const band =
    overall >= 90
      ? "Excellent"
      : overall >= 80
      ? "Very Good"
      : overall >= 70
      ? "Good"
      : overall >= 60
      ? "Average"
      : "Needs Improvement";

  return (
    <div className="analyzer-grid">
      {analysis.is_fallback && <FallbackBadge />}

      {/* Overall Score */}
      <section className="panel score-panel">
        <div className="score-summary">
          <div>
            <SectionEyebrow>OVERALL QUALITY SCORE</SectionEyebrow>
            <h2>
              {band} ({overall}/100)
            </h2>
            <p>Calculated as the arithmetic mean of the 7 official IEEE quality dimensions.</p>
          </div>
          <ScoreRing score={overall} />
        </div>
        <div className="score-footer">
          <button className="text-button" onClick={onRunAnalysis} disabled={isAnalyzing}>
            <RotateCcw size={14} /> Re-run Audit
          </button>
          <button className="text-button" onClick={() => onNavigate("builder")}>
            Edit in Builder <ArrowUpRight size={15} />
          </button>
        </div>
      </section>

      {/* 7 Dimensions List */}
      <section className="panel dimensions-panel">
        <div className="panel-top">
          <div>
            <SectionEyebrow>SEVEN CORE DIMENSIONS</SectionEyebrow>
            <h3>Rubric Breakdown</h3>
          </div>
        </div>
        <div className="dimension-list">
          {dimensions.map((d) => {
            const tone = d.score >= 80 ? "mint" : d.score >= 60 ? "mango" : "coral";
            return (
              <div className="dimension-row" key={d.name}>
                <div className="dimension-copy">
                  <span>{d.name}</span>
                  <strong>{d.score} / 100</strong>
                </div>
                <ProgressLine value={d.score} tone={tone} />
                <p>{d.reason}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Strengths & Weaknesses */}
      <section className="panel issues-panel">
        <SectionEyebrow>STRENGTHS & WEAKNESSES</SectionEyebrow>
        <h3>Reviewer Observations</h3>
        <div className="obs-list">
          {analysis.strengths?.map((s, i) => (
            <div key={`str-${i}`} className="obs-item obs-good">
              <CheckCircle2 size={15} />
              <span>{s}</span>
            </div>
          ))}
          {analysis.weaknesses?.map((w, i) => (
            <div key={`weak-${i}`} className="obs-item obs-warn">
              <AlertCircle size={15} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Recommendations */}
      <section className="panel recommendation-panel">
        <SectionEyebrow>ACTIONABLE RECOMMENDATIONS</SectionEyebrow>
        <h3>Priority Revisions</h3>
        <div className="rec-list">
          {analysis.recommendations?.map((r, i) => (
            <div key={i} className="rec-item">
              <span className="rec-num">{String(i + 1).padStart(2, "0")}</span>
              <p>{r}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}


function ReviewerView({
  reviews,
  onRunReview,
  isReviewing,
  hasPaper,
}: {
  reviews: api.Review[];
  onRunReview: () => void;
  isReviewing: boolean;
  hasPaper: boolean;
}) {
  const review = reviews[0];

  if (!hasPaper) {
    return (
      <div className="reviewer-layout">
        <section className="panel reviewer-main empty-state-box">
          <Upload size={38} />
          <h3>Upload a paper for peer review</h3>
          <p>Simulate official conference review feedback and recommendation verdicts.</p>
        </section>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="reviewer-layout">
        <section className="panel reviewer-main empty-state-box">
          <UsersRound size={38} />
          <h3>Simulated Peer Review</h3>
          <p>Generates an academic critique, strengths, weaknesses, and a consensus recommendation verdict.</p>
          <PrimaryButton onClick={onRunReview} disabled={isReviewing} icon={isReviewing ? <Loader2 size={16} className="spin-icon" /> : <UsersRound size={16} />}>
            {isReviewing ? "Evaluating Paper…" : "Run Reviewer Simulation"}
          </PrimaryButton>
        </section>
      </div>
    );
  }

  const rec = review.recommendation || "Borderline";
  const recTone =
    rec === "Accept" || rec === "Weak Accept"
      ? "badge-success"
      : rec === "Borderline"
      ? "badge-warn"
      : "badge-danger";

  return (
    <div className="reviewer-layout">
      {review.is_fallback && <FallbackBadge />}

      <section className="panel reviewer-main">
        <div className="verdict-banner">
          <div>
            <span className="micro-label">CONFERENCE VERDICT</span>
            <h3>{rec}</h3>
            <p>Peer Review Synthesis</p>
          </div>
          <span className={cn("badge", recTone)}>{rec}</span>
        </div>

        <div className="reviewer-analysis-block">
          <SectionEyebrow>SYNTHESIS & ANALYSIS</SectionEyebrow>
          <p>{review.reviewer_analysis}</p>
        </div>

        <div className="reviewer-lists-grid">
          <div className="rev-list-box">
            <span className="micro-label">KEY STRENGTHS</span>
            {review.strengths?.map((s, i) => (
              <div key={i} className="rev-bullet rev-good">
                <Check size={14} /> <span>{s}</span>
              </div>
            ))}
          </div>

          <div className="rev-list-box">
            <span className="micro-label">CONCERNS & WEAKNESSES</span>
            {review.weaknesses?.map((w, i) => (
              <div key={i} className="rev-bullet rev-bad">
                <X size={14} /> <span>{w}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="reviewer-questions-box">
          <SectionEyebrow>QUESTIONS FOR AUTHORS TO PREPARE</SectionEyebrow>
          {review.reviewer_questions?.map((q, i) => (
            <div key={i} className="rev-question">
              <strong>Q{i + 1}:</strong> <span>{q}</span>
            </div>
          ))}
        </div>

        <button className="rerun-button" onClick={onRunReview} disabled={isReviewing}>
          <RotateCcw size={15} /> {isReviewing ? "Running Review…" : "Run Review Again"}
        </button>
      </section>
    </div>
  );
}


function ChatView({
  chat,
  chatInput,
  setChatInput,
  sendChat,
  chatLoading,
  chatLoadingStep,
}: {
  chat: api.ChatMessage[];
  chatInput: string;
  setChatInput: (value: string) => void;
  sendChat: (preset?: string) => void;
  chatLoading: boolean;
  chatLoadingStep: "searching" | "generating";
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, chatLoading]);

  return (
    <div className="chat-layout">
      <section className="panel chat-panel">
        <div className="chat-header">
          <div>
            <SectionEyebrow>RAG-POWERED PAPER CHAT</SectionEyebrow>
            <h2>Ask your draft anything.</h2>
          </div>
          <span className="context-chip">
            <span className="status-dot dot-online" /> Grounded in Paper Text
          </span>
        </div>

        <div className="chat-messages">
          {chat.map((msg, index) => (
            <div key={index} className={cn("chat-message", msg.role === "user" && "message-user")}>
              <div className={cn("chat-avatar", msg.role === "user" ? "chat-user-avatar" : "chat-ai-avatar")}>
                {msg.role === "user" ? <UserRound size={15} /> : <Bot size={16} />}
              </div>
              <div className="chat-bubble">
                <span className="chat-role">{msg.role === "user" ? "You" : "ResearchLens"}</span>
                <p>{msg.text}</p>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="chat-sources">
                    <small>Citations: {msg.sources.join(" · ")}</small>
                  </div>
                )}
              </div>
            </div>
          ))}

          {chatLoading && (
            <div className="chat-message">
              <div className="chat-avatar chat-ai-avatar">
                <Bot size={16} />
              </div>
              <div className="chat-bubble">
                <span className="chat-role">ResearchLens</span>
                <p className="typing-indicator">
                  <Loader2 size={13} className="spin-icon inline-icon" />{" "}
                  {chatLoadingStep === "searching" ? "Searching your paper chunks…" : "Generating response…"}
                </p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-composer">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendChat()}
            placeholder="Ask about methodology, baseline comparisons, limitations, evidence…"
            disabled={chatLoading}
          />
          <button onClick={() => sendChat()} aria-label="Send message" disabled={chatLoading || !chatInput.trim()}>
            <Send size={17} />
          </button>
        </div>
      </section>

      <aside className="panel chat-side">
        <SectionEyebrow>GROUNDED PROMPTS</SectionEyebrow>
        <h3>Explore the paper.</h3>
        <div className="prompt-stack">
          <button onClick={() => sendChat("What is the core problem and research gap?")}>
            What is the core research gap? <ArrowUpRight size={15} />
          </button>
          <button onClick={() => sendChat("Explain the Methodology and pipeline architecture")}>
            Explain the Methodology pipeline <ArrowUpRight size={15} />
          </button>
          <button onClick={() => sendChat("What are the main experimental baselines and results?")}>
            What are the experimental results? <ArrowUpRight size={15} />
          </button>
          <button onClick={() => sendChat("What are the stated limitations of this paper?")}>
            What are the stated limitations? <ArrowUpRight size={15} />
          </button>
        </div>
      </aside>
    </div>
  );
}
