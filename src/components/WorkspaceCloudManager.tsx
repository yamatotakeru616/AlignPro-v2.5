import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User 
} from 'firebase/auth';
import { app, auth } from '../lib/firebase';
import { googleWorkspace, PlanFile } from '../lib/googleWorkspace';
import { 
  Cloud, 
  CloudUpload, 
  CloudDownload, 
  LogIn, 
  LogOut, 
  Trash2, 
  Check, 
  RefreshCw, 
  X, 
  FileSpreadsheet, 
  ExternalLink, 
  Wifi, 
  WifiOff 
} from 'lucide-react';
import { ControlPoint, CrossSectionParams } from '../types';

interface WorkspaceCloudManagerProps {
  controlPoints: ControlPoint[];
  crossSection: CrossSectionParams;
  sections: any[];
  onLoadPlan: (data: { controlPoints: ControlPoint[]; crossSection: CrossSectionParams; sections: any[] }) => void;
}

// In-memory cache for the access token to avoid storing in localStorage/sessionStorage (Security Best Practice)
let globalCachedAccessToken: string | null = null;

export default function WorkspaceCloudManager({
  controlPoints,
  crossSection,
  sections,
  onLoadPlan
}: WorkspaceCloudManagerProps) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(globalCachedAccessToken);
  const [plans, setPlans] = useState<PlanFile[]>([]);
  
  const [showModal, setShowModal] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  
  // Helper to generate a default timestamped plan name
  const getDefaultPlanName = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `道路設計案_${yyyy}${mm}${dd}_${hh}${min}`;
  };

  const [newPlanName, setNewPlanName] = useState(() => getDefaultPlanName());
  const [newPlanDesc, setNewPlanDesc] = useState('');

  // Automatically update plan name with a fresh timestamp whenever modal opens
  useEffect(() => {
    if (showModal) {
      setNewPlanName(getDefaultPlanName());
    }
  }, [showModal]);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Last successful sync time (persisted across sessions via localStorage)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(() => {
    const saved = localStorage.getItem('3dcim_last_sync_time');
    return saved ? new Date(saved) : null;
  });

  const updateLastSyncTime = () => {
    const now = new Date();
    setLastSyncTime(now);
    localStorage.setItem('3dcim_last_sync_time', now.toISOString());
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isSyncing = plansLoading || saveLoading || !!loadingFileId || !!deletingFileId;

  // Track Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        // Clear token on sign out
        globalCachedAccessToken = null;
        setAccessToken(null);
        setPlans([]);
      } else {
        // If user is logged in but we lost the token, they need to log in again with Google to re-authenticate scopes
        if (!globalCachedAccessToken) {
          setUser(null);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch plans from Drive when token is available
  useEffect(() => {
    if (user && accessToken) {
      fetchDrivePlans();
    }
  }, [user, accessToken]);

  const fetchDrivePlans = async () => {
    if (!accessToken) return;
    setPlansLoading(true);
    showStatus('Googleドライブをスキャン中...', 'success');
    try {
      const files = await googleWorkspace.listPlans(accessToken);
      setPlans(files);
      showStatus('設計スプレッドシートの取得に成功しました', 'success');
      updateLastSyncTime();
    } catch (err: any) {
      console.error(err);
      showStatus(`同期エラー: ドライブからの設計一覧の取得に失敗しました (${err.message || '通信タイムアウト'})`, 'error');
    } finally {
      setPlansLoading(false);
    }
  };

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ text, type });
    setTimeout(() => {
      setStatusMsg(prev => prev.text === text ? { text: '', type: '' } : prev);
    }, 5000); // Slightly longer timeout for visibility
  };

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    // Add Scopes for Google Drive & Google Sheets
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.addScope('https://www.googleapis.com/auth/spreadsheets');

    try {
      setPlansLoading(true);
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Google OAuthアクセスキーの取得に失敗しました');
      }

      globalCachedAccessToken = credential.accessToken;
      setAccessToken(credential.accessToken);
      setUser(result.user);
      showStatus('Google認証に成功しました。スプレッドシート連携が有効です。', 'success');
      updateLastSyncTime();
    } catch (err: any) {
      console.error('Sign-in error:', err);
      showStatus(`同期エラー: ログインに失敗しました (${err.message || '認証エラー'})`, 'error');
    } finally {
      setPlansLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      globalCachedAccessToken = null;
      setAccessToken(null);
      setUser(null);
      setPlans([]);
      setShowModal(false);
      showStatus('ログアウトしました', 'success');
    } catch (err) {
      showStatus('ログアウトに失敗しました', 'error');
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) {
      showStatus('同期エラー: 連携が切れています。再ログインしてください。', 'error');
      return;
    }

    if (!newPlanName.trim()) {
      showStatus('プラン名を入力してください', 'error');
      return;
    }

    setSaveLoading(true);
    showStatus('Googleスプレッドシートを新規作成・保存中...', 'success');
    try {
      const newPlan = await googleWorkspace.createPlanSpreadsheet(
        accessToken,
        newPlanName.trim(),
        newPlanDesc.trim(),
        controlPoints,
        crossSection,
        sections
      );

      // Add to local state list immediately
      setPlans(prev => [newPlan, ...prev]);
      setNewPlanName(getDefaultPlanName());
      setNewPlanDesc('');
      showStatus('Googleスプレッドシートとして設計案を保存しました！', 'success');
      updateLastSyncTime();
    } catch (err: any) {
      console.error(err);
      showStatus(`同期エラー: スプレッドシートの保存に失敗しました (${err.message || 'API制限またはアクセス権限不足'})`, 'error');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleLoadPlan = async (fileId: string, fileName: string) => {
    if (!accessToken) return;
    
    setLoadingFileId(fileId);
    showStatus(`スプレッドシート「${fileName}」から設計を復元中...`, 'success');
    try {
      const data = await googleWorkspace.readPlanSpreadsheet(accessToken, fileId);
      onLoadPlan(data);
      showStatus('Googleスプレッドシートからアライメント設計を復元しました！', 'success');
      setShowModal(false);
      updateLastSyncTime();
    } catch (err: any) {
      console.error(err);
      showStatus(`同期エラー: 設計復帰に失敗しました (${err.message || 'スプレッドシート形式のパースエラー'})`, 'error');
    } finally {
      setLoadingFileId(null);
    }
  };

  const handleDeletePlan = async (fileId: string, fileName: string) => {
    if (!accessToken) return;

    // MANDATORY confirmation dialog for data mutations
    const confirmed = window.confirm(
      `Googleドライブ上のスプレッドシート「${fileName}」をゴミ箱に移動しますか？\nこの操作はGoogleドライブから元に戻せます。`
    );
    if (!confirmed) return;

    setDeletingFileId(fileId);
    showStatus(`スプレッドシートをゴミ箱に移動中...`, 'success');
    try {
      await googleWorkspace.deletePlanSpreadsheet(accessToken, fileId);
      setPlans(prev => prev.filter(p => p.id !== fileId));
      showStatus('スプレッドシートをゴミ箱に移動しました', 'success');
      updateLastSyncTime();
    } catch (err: any) {
      console.error(err);
      showStatus(`同期エラー: ゴミ箱への移動に失敗しました (${err.message || '権限またはファイル消失'})`, 'error');
    } finally {
      setDeletingFileId(null);
    }
  };

  return (
    <div className="flex items-center gap-2 select-none">
      {/* クラウド接続ステータスインジケーター & 操作ボタン */}
      {user && accessToken ? (
        <div className="flex items-center gap-2 bg-slate-900 border border-white/10 rounded-lg p-1.5 px-3 shadow-sm animate-fade-in text-[11px]">
          {/* リアルタイムステータスインジケーター */}
          {isSyncing ? (
            <div 
              className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400 font-medium cursor-help"
              title="Google Drive: 現在スプレッドシートとの同期処理を実行中です..."
            >
              <RefreshCw className="w-3 h-3 animate-spin text-sky-400" />
              <span>同期中</span>
            </div>
          ) : !isOnline ? (
            <div 
              className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 font-medium cursor-help"
              title="Google Drive: ネットワーク接続が切断されています"
            >
              <WifiOff className="w-3 h-3 text-rose-500 animate-pulse" />
              <span>切断</span>
            </div>
          ) : (
            <div 
              className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium cursor-help"
              title="Google Drive: ドライブ連携はアクティブで良好な状態です"
            >
              <Cloud className="w-3 h-3 text-emerald-400" />
              <span>接続済み</span>
            </div>
          )}

          <div className="h-3 w-[1px] bg-white/5 mx-0.5"></div>

          {/* 前回の同期タイムスタンプ表示 */}
          <div className="flex items-center gap-1 text-slate-400 font-mono text-[10px]" title="前回の設計データ同期完了時刻">
            <span className="text-slate-500">同期:</span>
            <span className={lastSyncTime ? "text-cyan-400 font-semibold" : "text-slate-600"}>
              {lastSyncTime ? lastSyncTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '未同期'}
            </span>
          </div>

          <div className="h-3 w-[1px] bg-white/5 mx-0.5"></div>

          <span className="text-slate-300 font-medium truncate max-w-[100px]" title={`Googleアカウント: ${user.email}`}>
            {user.displayName || user.email?.split('@')[0]}
          </span>

          <button
            onClick={() => setShowModal(true)}
            className={`ml-1.5 px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold rounded-lg text-[10px] cursor-pointer transition-all flex items-center gap-1.5 hover:shadow-[0_0_12px_rgba(59,130,246,0.5)] border border-white/10 ${
              !lastSyncTime ? 'animate-pulse ring-2 ring-blue-500/40' : ''
            }`}
            title="クリックしてGoogleスプレッドシートへの保存・ロード画面を開きます"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>スプレッドシート保存・読込</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {/* 未ログイン時の極小ステータスインジケーター */}
          <div 
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium bg-slate-900/50 cursor-help ${
              isOnline ? 'border-emerald-500/20 text-emerald-400' : 'border-rose-500/20 text-rose-400'
            }`}
            title={isOnline ? 'Google API: オンライン（インターネットに接続されています）' : 'Google API: オフライン（ネットワーク環境を確認してください）'}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></div>
            <span>{isOnline ? 'オンライン' : 'オフライン'}</span>
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="bg-slate-900 hover:bg-slate-800 border border-white/10 hover:border-cyan-500/30 rounded-lg p-1.5 px-3 flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-cyan-400 transition-all cursor-pointer shadow-sm"
          >
            <Cloud className="w-4 h-4 text-cyan-400" />
            <span>Googleスプレッドシート連携</span>
          </button>
        </div>
      )}

      {/* ステータスメッセージトースト（同期エラーおよび進捗を視覚的にアピール） */}
      {statusMsg.text && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border text-xs font-semibold shadow-2xl backdrop-blur-md animate-fade-in transition-all ${
          statusMsg.type === 'error' 
            ? 'bg-rose-950/95 border-rose-500/30 text-rose-200 shadow-rose-950/30' 
            : 'bg-slate-950/95 border-cyan-500/30 text-cyan-200 shadow-cyan-950/30'
        }`}>
          {statusMsg.type === 'error' ? (
            <div className="p-1 rounded bg-rose-500/20 text-rose-400">
              <WifiOff className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="p-1 rounded bg-cyan-500/20 text-cyan-400 animate-pulse">
              <Cloud className="w-3.5 h-3.5" />
            </div>
          )}
          <div className="flex flex-col">
            <span className="font-extrabold text-[9px] uppercase tracking-wider opacity-60">
              {statusMsg.type === 'error' ? 'Google API 同期エラー' : 'Google API 連携ステータス'}
            </span>
            <span className="text-[11px] mt-0.5 leading-relaxed">{statusMsg.text}</span>
          </div>
        </div>
      )}

      {/* スプレッドシート管理モーダルダイアログ */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 overflow-y-auto flex items-start justify-center p-2 sm:p-4 animate-fade-in text-slate-200 font-sans">
          <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-4xl my-auto flex flex-col shadow-2xl overflow-hidden max-h-[95vh] sm:max-h-[90vh] md:max-h-[85vh]">
            
            {/* モーダルヘッダー */}
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Googleスプレッドシート＆ドライブ設計アーカイブ</h3>
                  <p className="text-[10px] text-slate-400">設計データをGoogleスプレッドシート形式で直接保存・管理します</p>
                </div>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* モーダルコンテンツ (グリッド分割) */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
              
              {/* 左カラム: 新規保存フォーム */}
              <div className="lg:col-span-2 space-y-4 border-r border-white/5 pr-0 lg:pr-6">
                <h4 className="text-xs font-extrabold text-white flex items-center gap-1.5 uppercase tracking-wider">
                  <CloudUpload className="w-4 h-4 text-cyan-400" />
                  現在の設計案を保存
                </h4>
                
                <form onSubmit={handleSavePlan} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">設計プラン名</label>
                    <input 
                      type="text" 
                      required
                      placeholder="例: 国道11号バイパス計画案-A"
                      value={newPlanName}
                      onChange={(e) => setNewPlanName(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 focus:border-cyan-500/50 rounded-lg p-2 text-xs text-white placeholder-slate-600 outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">設計の概要 / 説明</label>
                    <textarea 
                      placeholder="例: 始点から中間地点まで高架橋断面を採用、法面すり付けを最適化。"
                      value={newPlanDesc}
                      onChange={(e) => setNewPlanDesc(e.target.value)}
                      rows={4}
                      className="w-full bg-slate-950 border border-white/10 focus:border-cyan-500/50 rounded-lg p-2 text-xs text-white placeholder-slate-600 outline-none resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saveLoading || !isOnline}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 font-bold text-white text-xs py-2 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {saveLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Google Sheets に出力中...</span>
                      </>
                    ) : (
                      <>
                        <CloudUpload className="w-4 h-4" />
                        <span>Googleスプレッドシートとして保存</span>
                      </>
                    )}
                  </button>
                </form>

                <div className="bg-slate-950/60 border border-white/5 p-3 rounded-lg text-[11px] text-slate-400 space-y-2 leading-relaxed">
                  <span className="font-bold text-slate-300">💡 スプレッドシート連携の強み:</span>
                  <p>保存された設計案は、あなたのGoogleドライブ内に直接Googleスプレッドシートとして作成されます。Overview、Alignment Points、Cross Section、Segmentsの4つのタブに座標や諸元値がきれいな表として出力されるため、ブラウザ以外からでも直接CAD情報を閲覧・編集可能です。</p>
                </div>
              </div>

              {/* 右カラム: ドライブ内のスプレッドシート一覧 */}
              <div className="lg:col-span-3 space-y-4 flex flex-col min-h-[300px]">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-white flex items-center gap-1.5 uppercase tracking-wider">
                    <CloudDownload className="w-4 h-4 text-emerald-400" />
                    保存された設計スプレッドシート一覧
                  </h4>
                  <button 
                    onClick={fetchDrivePlans}
                    disabled={plansLoading}
                    className="p-1 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                    title="再読み込み"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${plansLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {plansLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin text-cyan-500" />
                    <span className="text-xs">Googleドライブをロード中...</span>
                  </div>
                ) : plans.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 border border-dashed border-white/5 rounded-lg p-6 bg-slate-950/20 text-slate-500 text-center">
                    <FileSpreadsheet className="w-8 h-8 opacity-30 text-emerald-400" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400">スプレッドシートが見つかりません</p>
                      <p className="text-[10px] text-slate-600">左側のフォームから最初の設計をGoogleスプレッドシートに出力してください</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-2 max-h-[45vh] pr-2">
                    {plans.map((plan) => (
                      <div 
                        key={plan.id}
                        className="bg-slate-950/50 border border-white/5 hover:border-cyan-500/30 rounded-lg p-3 transition-all flex items-center justify-between gap-4 group animate-fade-in"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="font-bold text-xs text-white truncate group-hover:text-cyan-400 transition-colors">
                              {plan.name.replace(' [3D-CIM]', '')}
                            </span>
                          </div>
                          
                          {plan.description && (
                            <p className="text-[10px] text-slate-500 line-clamp-1">{plan.description}</p>
                          )}
                          
                          <p className="text-[9px] text-slate-600 font-mono">
                            更新: {new Date(plan.modifiedTime).toLocaleString()}
                          </p>
                        </div>

                        {/* アクション群 */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {plan.webViewLink && (
                            <a 
                              href={plan.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-white/10 hover:border-emerald-500/30 text-slate-400 hover:text-emerald-400 rounded-lg transition-all"
                              title="Google Sheets で開く"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}

                          <button
                            onClick={() => handleLoadPlan(plan.id, plan.name)}
                            disabled={loadingFileId !== null}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                            title="このスプレッドシートを適用して現在の設計を上書き復元します"
                          >
                            {loadingFileId === plan.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <CloudDownload className="w-3 h-3" />
                            )}
                            <span>ロード</span>
                          </button>

                          <button
                            onClick={() => handleDeletePlan(plan.id, plan.name)}
                            disabled={deletingFileId !== null}
                            className="p-1.5 bg-slate-900 hover:bg-rose-950 border border-white/10 hover:border-rose-500/30 text-slate-500 hover:text-rose-400 rounded-lg transition-all cursor-pointer"
                            title="ゴミ箱へ移動"
                          >
                            {deletingFileId === plan.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-500" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* モーダルフッター（Googleドライブ接続ステータス、前回の同期タイムスタンプ、認証情報の一括表示） */}
            <div className="p-4 border-t border-white/5 bg-slate-950/60 flex flex-col sm:flex-row gap-3 items-center justify-between text-[11px] text-slate-500">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400 animate-pulse'}`}></span>
                  <span className="font-bold text-slate-400">Googleドライブ接続:</span>
                  <span className={isOnline ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                    {isOnline ? '接続良好 (オンライン)' : '切断中 (オフライン)'}
                  </span>
                </div>
                
                <div className="h-3 w-[1px] bg-white/10 hidden sm:block"></div>

                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-400">前回の同期完了時刻:</span>
                  <span className="text-slate-300 font-mono font-semibold">
                    {lastSyncTime ? lastSyncTime.toLocaleString('ja-JP') : '未同期'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-slate-400">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                  <span>連携アカウント: {user.email}</span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1 text-slate-400 hover:text-rose-400 transition-colors font-semibold cursor-pointer"
                  title="Google Drive 接続を安全に解除"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>切断</span>
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
