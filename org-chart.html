<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>组织架构与账号管理 - 戴维斯设计需求管理中心</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap');
        body { background-color: #09090b; color: #e4e4e7; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
        ::-webkit-scrollbar { width: 0px; } 
        .custom-scrollbar { overflow-y: auto; padding-right: 8px; scroll-behavior: smooth; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 10px; }
        .btn-press { transition: all 0.15s ease; cursor: pointer; }
        .btn-press:active { transform: scale(0.95); }
        
        .bg-glow-purple { position: absolute; top: -10%; left: 30%; width: 800px; height: 600px; background: radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%); border-radius: 50%; filter: blur(120px); pointer-events: none; z-index: 0; }
        
        tr { transition: background-color 0.2s ease; }
        tr:hover td { background-color: rgba(255, 255, 255, 0.03); }

        .modal-enter { animation: modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes modalFadeIn { 0% { opacity: 0; transform: scale(0.97) translateY(10px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
        .toast-slide-in { animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

        .perm-checkbox:checked + div { background-color: rgba(168, 85, 247, 0.15); border-color: #a855f7; color: #c084fc; }
    </style>
</head>
<body class="flex h-screen overflow-hidden relative selection:bg-purple-500/30 text-zinc-300">

    <div class="absolute inset-0 bg-[#09090b] z-0 pointer-events-none"></div>
    <div class="bg-glow-purple"></div>

    <aside class="w-[240px] border-r border-white/5 flex flex-col z-10 bg-[#09090b] shrink-0 h-full">
        <div class="p-7 border-b border-white/5 shrink-0">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-fuchsia-600 flex items-center justify-center shadow-[0_0_15px_rgba(192,38,211,0.3)] shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
                </div>
                <h1 class="text-[15px] font-bold text-white tracking-wide">戴维斯需求大厅</h1>
            </div>
        </div>

        <div class="flex-1 overflow-y-auto p-5 space-y-2">
            <button onclick="window.location.href='manager-workspace.html'" class="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-zinc-400 hover:bg-white/5 hover:text-white transition-all btn-press">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                <span class="font-medium text-[14px]">总监控制台</span>
            </button>
            <button onclick="window.location.href='manager-dashboard.html'" class="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-zinc-400 hover:bg-white/5 hover:text-white transition-all btn-press">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                <span class="font-medium text-[14px]">团队效能大盘</span>
            </button>
            <button onclick="window.location.href='project-analysis.html'" class="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-zinc-400 hover:bg-white/5 hover:text-white transition-all btn-press">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                <span class="font-medium text-[14px]">项目投入分析</span>
            </button>
            <button class="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 transition-all btn-press cursor-default">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                <span class="font-bold text-[14px]">组织架构与账号</span>
            </button>
            <button onclick="window.location.href='message-center.html?role=admin'" class="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-zinc-400 hover:bg-white/5 hover:text-white transition-all btn-press">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                <span class="font-medium text-[14px]">全局消息中心</span>
            </button>
        </div>

        <div class="px-5 py-6 mt-auto border-t border-white/5 bg-[#0c0c0e] shrink-0 flex items-center justify-between relative z-[9999]">
            <div class="flex items-center gap-3 min-w-0">
                <div id="sidebar-avatar" class="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-lg">?</div>
                <div class="min-w-0 flex-1">
                    <p id="sidebar-name" class="text-[13px] font-bold text-white mb-0.5 truncate">加载中...</p>
                    <p id="sidebar-role" class="text-[10px] text-zinc-500 truncate">读取中</p>
                </div>
            </div>
            <div class="flex items-center gap-1 shrink-0 ml-2">
                <button onclick="window.openPwdModal()" class="p-1.5 text-zinc-500 hover:text-fuchsia-400 hover:bg-fuchsia-500/10 rounded-lg transition-colors btn-press cursor-pointer pointer-events-auto relative z-50" title="修改登录密码">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
                </button>
                <button onclick="window.logout(event)" class="p-1.5 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors btn-press cursor-pointer pointer-events-auto relative z-50" title="退出登录">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
            </div>
        </div>
    </aside>

    <main class="flex-1 flex flex-col h-full overflow-hidden relative z-10 bg-[#0c0c0e]" id="main-content-area">
        <header class="px-10 py-6 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl shrink-0 relative z-[999]">
            <div class="flex justify-between items-start w-full">
                <div>
                    <h2 class="text-[24px] font-bold text-white tracking-tight mb-1.5 flex items-center gap-3">
                        组织架构与权限管理 
                        <span class="bg-fuchsia-500/20 text-fuchsia-400 text-[11px] px-2.5 py-0.5 rounded-lg border border-fuchsia-500/30">超管专属</span>
                    </h2>
                    <p class="text-[12px] text-zinc-500">维护系统成员名单，真实分配【需求发单】、【设计接单】、【后台统筹】等角色权限。</p>
                </div>
                
                <div class="flex items-center gap-5">
                    <button onclick="openModal('add')" class="bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-5 py-2.5 rounded-[12px] text-[13px] font-bold shadow-[0_5px_15px_rgba(192,38,211,0.25)] transition-all flex items-center gap-2 btn-press">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        新增系统成员
                    </button>
                    <div class="w-px h-6 bg-white/10 mx-2"></div>
                    <div class="relative" id="identity-wrapper">
                        <button id="identityBtn" class="bg-[#141417] border border-white/10 text-zinc-300 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-[12px] font-medium hover:bg-white/5 transition-colors btn-press">加载中...</button>
                    </div>
                </div>
            </div>
        </header>

        <div class="flex-1 p-10 overflow-hidden flex flex-col">
            
            <div class="flex items-center justify-between mb-6 shrink-0">
                <div class="flex items-center gap-4">
                    <div class="relative w-64">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg class="h-4 w-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </div>
                        <input type="text" id="searchInput" onkeyup="filterTableLocally()" class="w-full bg-[#121217] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-white outline-none focus:border-fuchsia-500 transition-colors" placeholder="搜索企微英文名或花名...">
                    </div>
                    <select id="roleFilter" onchange="filterTableLocally()" class="bg-[#121217] border border-white/10 rounded-xl px-4 py-2.5 text-[13px] text-zinc-300 outline-none hover:border-white/20 transition-colors cursor-pointer appearance-none min-w-[140px]">
                        <option value="all">所有系统权限</option>
                        <option value="admin">系统管理员 (含统筹)</option>
                        <option value="design">执行设计师</option>
                        <option value="req">仅需求方</option>
                    </select>
                </div>
                <div class="text-[12px] text-zinc-500">共 <span id="total-users" class="text-white font-bold font-mono">0</span> 名系统成员</div>
            </div>

            <div class="flex-1 bg-[#121217] border border-white/5 rounded-2xl overflow-hidden flex flex-col shadow-xl relative">
                
                <div id="table-loading" class="absolute inset-0 bg-[#121217]/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center">
                    <svg class="animate-spin h-8 w-8 text-fuchsia-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p class="text-xs text-zinc-500 font-bold tracking-widest uppercase">SYNCING ACCOUNTS...</p>
                </div>

                <div class="overflow-y-auto custom-scrollbar flex-1 relative">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-[#18181b] sticky top-0 z-10">
                            <tr>
                                <th class="py-4 px-6 text-[11px] font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5">用户资料</th>
                                <th class="py-4 px-6 text-[11px] font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5">企微登录账号</th>
                                <th class="py-4 px-6 text-[11px] font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5">配置角色 / 模块权限</th>
                                <th class="py-4 px-6 text-[11px] font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5">账号状态</th>
                                <th class="py-4 px-6 text-[11px] font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5 text-right">后台操作</th>
                            </tr>
                        </thead>
                        <tbody class="text-[13px] text-zinc-300 divide-y divide-white/5" id="user-table-body">
                            </tbody>
                    </table>
                    
                    <div id="emptyState" class="hidden flex-col items-center justify-center py-24 opacity-50 w-full absolute top-10 left-0">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-zinc-500 mb-4"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <p class="text-[14px] font-medium text-zinc-400">没有找到匹配的成员账号</p>
                    </div>
                </div>
            </div>

        </div>
    </main>

    <div id="user-modal-overlay" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[99999] hidden opacity-0 transition-opacity duration-300 flex items-center justify-center" onclick="if(event.target === this) closeUserModal()">
        <div id="user-modal" class="hidden w-full max-w-lg bg-[#121217] border border-fuchsia-500/30 rounded-3xl shadow-[0_20px_50px_-10px_rgba(192,38,211,0.2)] flex flex-col scale-95 transition-transform duration-300">
            <div class="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-[#1a1a1f] rounded-t-3xl">
                <h2 class="text-[15px] font-bold text-white flex items-center gap-2" id="modal-title">新增系统成员</h2>
                <button onclick="closeUserModal()" class="text-zinc-500 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-full p-1.5 transition-colors btn-press"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            
            <div class="p-6 space-y-5">
                <input type="hidden" id="edit-mode-key" value="">
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-[12px] font-bold text-zinc-300 mb-2">企微英文名 (登录账号) <span class="text-rose-500">*</span></label>
                        <input type="text" id="ipt-enName" class="w-full bg-[#09090b] border border-zinc-700 rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-fuchsia-500 transition-colors" placeholder="如: david">
                    </div>
                    <div>
                        <label class="block text-[12px] font-bold text-zinc-300 mb-2">系统展示花名 / 中文名 <span class="text-rose-500">*</span></label>
                        <input type="text" id="ipt-displayName" class="w-full bg-[#09090b] border border-zinc-700 rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-fuchsia-500 transition-colors" placeholder="如: 文哥">
                    </div>
                </div>

                <div>
                    <label class="block text-[12px] font-bold text-zinc-300 mb-2">初始登录密码 <span class="text-zinc-500 font-normal">(编辑模式下不填代表不修改)</span></label>
                    <input type="text" id="ipt-pwd" class="w-full bg-[#09090b] border border-zinc-700 rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-fuchsia-500 transition-colors" placeholder="默认分配为: 123456" value="123456">
                </div>

                <div class="pt-2 border-t border-white/5 mt-2">
                    <label class="block text-[12px] font-bold text-zinc-300 mb-3">分配系统权限模块 (支持多选) <span class="text-rose-500">*</span></label>
                    <div class="space-y-2">
                        <label class="flex cursor-pointer group">
                            <input type="checkbox" class="hidden perm-checkbox" value="req" checked>
                            <div class="w-full border border-zinc-700 bg-[#09090b] text-zinc-400 px-4 py-3 rounded-xl transition-colors flex items-center justify-between">
                                <span class="text-[13px] font-medium flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> 需求发起与验收 (基础权限)</span>
                            </div>
                        </label>
                        <label class="flex cursor-pointer group">
                            <input type="checkbox" class="hidden perm-checkbox" value="design">
                            <div class="w-full border border-zinc-700 bg-[#09090b] text-zinc-400 px-4 py-3 rounded-xl transition-colors flex items-center justify-between">
                                <span class="text-[13px] font-medium flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg> 执行看板接单做图 (设计师)</span>
                            </div>
                        </label>
                        <label class="flex cursor-pointer group">
                            <input type="checkbox" class="hidden perm-checkbox" value="admin">
                            <div class="w-full border border-zinc-700 bg-[#09090b] text-zinc-400 px-4 py-3 rounded-xl transition-colors flex items-center justify-between">
                                <span class="text-[13px] font-medium flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line></svg> 后台统筹分单与审批 (主管)</span>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="p-5 border-t border-white/5 bg-[#09090b] flex justify-end gap-3 rounded-b-3xl">
                <button onclick="closeUserModal()" class="px-5 py-2.5 bg-transparent border border-zinc-700 text-zinc-400 hover:text-white rounded-xl text-[12px] font-bold btn-press transition-colors">取消</button>
                <button onclick="saveUser()" id="btn-save-user" class="px-6 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-xl text-[12px] font-bold shadow-[0_5px_15px_rgba(192,38,211,0.3)] btn-press transition-all">保存配置</button>
            </div>
        </div>
    </div>

    <div id="custom-dialog-overlay" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999999] hidden opacity-0 transition-opacity duration-300 flex items-center justify-center" onclick="if(event.target === this && !dialogIsForce) hideDialog()">
        <div id="custom-dialog-box" class="bg-[#121217] border border-white/10 rounded-3xl p-8 max-w-sm w-full shadow-2xl transform scale-95 transition-transform duration-300 text-center relative overflow-hidden">
            <div id="dialog-color-bar" class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-fuchsia-500 to-purple-600"></div>
            <div id="dialog-icon-container" class="w-16 h-16 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center mx-auto mb-5 text-fuchsia-400 shadow-[0_0_20px_rgba(192,38,211,0.2)]"></div>
            <h3 id="dialog-title" class="text-[18px] font-bold text-white mb-2">提示</h3>
            <p id="dialog-desc" class="text-[13px] text-zinc-400 leading-relaxed mb-8">内容</p>
            <div class="flex gap-3 justify-center">
                <button id="dialog-cancel-btn" onclick="hideDialog()" class="flex-1 py-3 bg-transparent border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white rounded-xl text-sm font-bold transition-colors btn-press hidden">取消</button>
                <button id="dialog-confirm-btn" onclick="handleDialogConfirm()" class="flex-1 py-3 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-xl text-sm font-bold shadow-[0_5px_15px_rgba(192,38,211,0.3)] transition-all btn-press">我知道了</button>
            </div>
        </div>
    </div>

    <div id="pwd-modal-overlay" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999999] hidden opacity-0 transition-opacity duration-300 flex items-center justify-center" onclick="if(event.target === this) closePwdModal()">
        <div id="pwd-modal" class="hidden w-full max-w-sm bg-[#121217] border border-white/10 rounded-3xl shadow-2xl flex flex-col scale-95 transition-transform duration-300 p-6 relative">
            <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-fuchsia-500 to-indigo-500 rounded-t-3xl"></div>
            <div class="flex justify-between items-center mb-6 mt-2">
                <h2 class="text-[16px] font-bold text-white flex items-center gap-2"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-fuchsia-500"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg> 修改登录密码</h2>
                <button onclick="closePwdModal()" class="text-zinc-500 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-full p-1 transition-colors btn-press"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div class="space-y-4">
                <div><label class="block text-[12px] font-bold text-zinc-400 mb-1.5">当前密码</label><input type="password" id="old-pwd" class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-fuchsia-500 transition-colors"></div>
                <div><label class="block text-[12px] font-bold text-zinc-400 mb-1.5">新密码</label><input type="password" id="new-pwd" class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-fuchsia-500 transition-colors"></div>
                <div><label class="block text-[12px] font-bold text-zinc-400 mb-1.5">确认新密码</label><input type="password" id="new-pwd-confirm" class="w-full bg-[#09090b] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-fuchsia-500 transition-colors"></div>
            </div>
            <button onclick="alert('系统演示环境暂不可自助修改密码'); closePwdModal();" class="w-full mt-6 py-3.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-xl text-sm font-bold shadow-[0_5px_15px_rgba(217,70,239,0.3)] transition-all btn-press">确认修改并重新登录</button>
        </div>
    </div>

    <div id="action-toast" class="fixed top-8 right-8 z-[100000] hidden toast-slide-in">
        <div class="bg-[#1a1a1f] border border-white/10 p-4 rounded-2xl shadow-2xl flex items-center gap-3 w-72">
            <div id="toast-icon" class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"></div>
            <div><h4 id="toast-title" class="text-white text-sm font-bold">成功</h4><p id="toast-desc" class="text-zinc-400 text-[11px] mt-0.5">操作已执行。</p></div>
        </div>
    </div>

    <script type="module">
        import { supabase } from './supabase-config.js';
        window.supabase = supabase;
        window.DB_USERS_TABLE = 'user_profiles'; 
        if(window.loadUsersFromCloud) window.loadUsersFromCloud();
    </script>

    <script>
        const PAGE_TYPE = 'admin'; 
        let globalUsersDB = {}; // 将同步云端数据至本地变量供快速筛选

        // ================= 弹窗引擎逻辑 =================
        let confirmCallback = null;
        let dialogIsForce = false;

        function customAlert(title, desc, callback = null, isForce = false, type = 'info') {
            document.getElementById('dialog-title').innerText = title;
            document.getElementById('dialog-desc').innerHTML = desc;
            document.getElementById('dialog-cancel-btn').style.display = 'none';
            document.getElementById('dialog-confirm-btn').innerText = '我知道了';
            
            const iconContainer = document.getElementById('dialog-icon-container');
            if (type === 'error' || type === 'warning') {
                iconContainer.className = "w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-5 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.2)]";
                iconContainer.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
            } else if (type === 'success') {
                iconContainer.className = "w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]";
                iconContainer.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
            } else {
                iconContainer.className = "w-16 h-16 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center mx-auto mb-5 text-fuchsia-400 shadow-[0_0_20px_rgba(192,38,211,0.2)]";
                iconContainer.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
            }

            confirmCallback = callback;
            dialogIsForce = isForce;
            showDialog();
        }

        function customConfirm(title, desc, callback) {
            customAlert(title, desc, callback, false, 'info');
            document.getElementById('dialog-cancel-btn').style.display = 'block';
            document.getElementById('dialog-confirm-btn').innerText = '确认执行';
        }

        function showDialog() {
            const overlay = document.getElementById('custom-dialog-overlay');
            const box = document.getElementById('custom-dialog-box');
            overlay.classList.remove('hidden');
            setTimeout(() => { overlay.classList.remove('opacity-0'); box.classList.remove('scale-95'); }, 10);
        }

        function hideDialog() {
            const overlay = document.getElementById('custom-dialog-overlay');
            const box = document.getElementById('custom-dialog-box');
            overlay.classList.add('opacity-0'); box.classList.add('scale-95');
            setTimeout(() => { overlay.classList.add('hidden'); }, 300);
        }

        function handleDialogConfirm() {
            hideDialog();
            if (confirmCallback) confirmCallback();
        }

        function logout(e) {
            if(e) e.stopPropagation();
            localStorage.removeItem('activeUserObj'); 
            window.location.href = 'login.html'; 
        }

        window.openPwdModal = function() {
            document.getElementById('pwd-modal-overlay').classList.remove('hidden'); 
            setTimeout(() => { document.getElementById('pwd-modal-overlay').classList.remove('opacity-0'); document.getElementById('pwd-modal').classList.remove('hidden', 'scale-95'); }, 10);
        }
        
        window.closePwdModal = function() {
            document.getElementById('pwd-modal-overlay').classList.add('opacity-0'); document.getElementById('pwd-modal').classList.add('scale-95'); 
            setTimeout(() => { document.getElementById('pwd-modal-overlay').classList.add('hidden'); document.getElementById('pwd-modal').classList.add('hidden'); }, 300);
        }

        function initRBAC() {
            const userStr = localStorage.getItem('activeUserObj');
            if (!userStr) { window.location.href = 'login.html'; return false; }
            const user = JSON.parse(userStr);

            if (user.enName !== 'davidxxu') {
                document.getElementById('main-content-area').style.filter = 'blur(10px)';
                customAlert('超级权限拦截', '组织架构管理属于系统高度机密，仅系统超级管理员 (许博文) 拥有访问权限。', () => {
                    window.location.href = 'manager-workspace.html'; 
                }, true, 'error');
                return false;
            }

            const avatarEl = document.getElementById('sidebar-avatar');
            if(avatarEl) { avatarEl.innerText = user.avatar; avatarEl.className = `w-9 h-9 rounded-full ${user.color} border border-white/20 flex items-center justify-center text-white font-bold text-sm shadow-lg`; }
            if(document.getElementById('sidebar-name')) document.getElementById('sidebar-name').innerText = user.displayName;
            if(document.getElementById('sidebar-role')) document.getElementById('sidebar-role').innerHTML = `<span class="text-fuchsia-400 font-bold">当前视角: 管理方</span>`;

            const triggerBtn = document.getElementById('identityBtn');
            if (triggerBtn) { triggerBtn.innerHTML = `<span class="text-fuchsia-500 font-black flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse shadow-[0_0_8px_#d946ef]"></span></span> 身份: 超级管理方`; }
            return true;
        }

        // ================= 💡 核心：云端拉取全量用户数据 =================
        window.loadUsersFromCloud = async function() {
            if(!window.supabase) return;
            try {
                const { data, error } = await window.supabase.from(window.DB_USERS_TABLE).select('*');
                if(error) throw error;
                
                globalUsersDB = {}; // 清空重置
                (data || []).forEach(row => {
                    globalUsersDB[row.en_name] = {
                        enName: row.en_name, cnName: row.cn_name, displayName: row.cn_name,
                        password: row.password, role: row.role, avatar: row.avatar, color: row.color,
                        perms: JSON.parse(row.perms_json || '[]')
                    };
                });

                document.getElementById('table-loading').classList.add('hidden');
                renderTableUI();
            } catch(e) {
                console.error(e);
                if (e.message.includes("relation") && e.message.includes("does not exist")) {
                    document.getElementById('table-loading').innerHTML = `<p class="text-rose-500 font-bold">云端数据表尚未建立</p><p class="text-xs text-zinc-500 max-w-sm mt-2 text-center">请先在 Supabase 后台新建表 \`user_profiles\`。具体字段配置请参考使用说明。</p>`;
                } else {
                    document.getElementById('table-loading').innerHTML = `<p class="text-rose-500 font-bold">数据拉取失败</p><p class="text-xs text-zinc-500">${e.message}</p>`;
                }
            }
        }

        // ================= 💡 核心：纯前端内存过滤并渲染 =================
        function renderTableUI() {
            const tbody = document.getElementById('user-table-body');
            tbody.innerHTML = '';
            
            const filterText = document.getElementById('searchInput').value.toLowerCase();
            const roleFilter = document.getElementById('roleFilter').value;

            let count = 0;
            for (let key in globalUsersDB) {
                const u = globalUsersDB[key];
                
                const matchSearch = u.enName.toLowerCase().includes(filterText) || u.displayName.toLowerCase().includes(filterText);
                let matchRole = true;
                if (roleFilter === 'admin' && !u.perms.includes('admin')) matchRole = false;
                if (roleFilter === 'design' && !u.perms.includes('design')) matchRole = false;
                if (roleFilter === 'req' && u.perms.includes('design')) matchRole = false; 

                if (!matchSearch || !matchRole) continue;

                count++;

                let badges = '';
                if(u.perms.includes('req')) badges += `<span class="bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded text-[10px] mr-1">发单验收</span>`;
                if(u.perms.includes('design')) badges += `<span class="bg-orange-500/10 border border-orange-500/20 text-orange-400 px-2 py-0.5 rounded text-[10px] mr-1">看板接单</span>`;
                if(u.perms.includes('admin')) badges += `<span class="bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 px-2 py-0.5 rounded text-[10px]">后台统筹</span>`;

                const tr = `
                    <tr class="hover:bg-white/5 transition-colors">
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-full ${u.color} border border-white/10 flex items-center justify-center text-white font-bold text-[11px]">${u.avatar}</div>
                                <div>
                                    <p class="text-[13px] font-bold text-white mb-0.5">${u.displayName}</p>
                                    <p class="text-[10px] text-zinc-500">${u.role}</p>
                                </div>
                            </div>
                        </td>
                        <td class="px-6 py-4 font-mono text-[12px] text-indigo-400">@${u.enName}</td>
                        <td class="px-6 py-4">${badges}</td>
                        <td class="px-6 py-4"><span class="flex items-center gap-1.5 text-[11px] text-emerald-500 font-bold"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>正常激活</span></td>
                        <td class="px-6 py-4 text-right">
                            <button onclick="openModal('edit', '${u.enName}')" class="text-[12px] text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors btn-press mr-1">编辑</button>
                            <button onclick="resetUserPwd('${u.enName}')" class="text-[12px] text-zinc-400 hover:text-amber-400 bg-zinc-800 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-colors btn-press mr-1">重置密码</button>
                            <button onclick="deleteUser('${u.enName}', '${u.displayName}')" class="text-[12px] text-zinc-400 hover:text-rose-500 bg-zinc-800 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg transition-colors btn-press">移除</button>
                        </td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', tr);
            }

            document.getElementById('total-users').innerText = count;
            document.getElementById('emptyState').style.display = count === 0 ? 'flex' : 'none';
        }

        window.filterTableLocally = function() { renderTableUI(); }

        const modalOverlay = document.getElementById('user-modal-overlay');
        const modal = document.getElementById('user-modal');
        
        window.openModal = function(mode, enName = '') {
            document.querySelectorAll('.perm-checkbox').forEach(cb => cb.checked = false);
            
            if (mode === 'add') {
                document.getElementById('modal-title').innerText = '新增系统成员';
                document.getElementById('ipt-enName').value = '';
                document.getElementById('ipt-enName').disabled = false;
                document.getElementById('ipt-displayName').value = '';
                document.getElementById('ipt-pwd').value = '123456';
                document.getElementById('edit-mode-key').value = '';
                document.querySelector('.perm-checkbox[value="req"]').checked = true;
            } else {
                const u = globalUsersDB[enName];
                document.getElementById('modal-title').innerText = '编辑成员权限: ' + u.displayName;
                document.getElementById('ipt-enName').value = u.enName;
                document.getElementById('ipt-enName').disabled = true; 
                document.getElementById('ipt-displayName').value = u.displayName;
                document.getElementById('ipt-pwd').value = '';
                document.getElementById('edit-mode-key').value = u.enName;

                u.perms.forEach(p => {
                    const cb = document.querySelector(`.perm-checkbox[value="${p}"]`);
                    if(cb) cb.checked = true;
                });
            }

            modalOverlay.classList.remove('hidden'); 
            setTimeout(() => { modalOverlay.classList.remove('opacity-0'); modal.classList.remove('hidden'); modal.classList.remove('scale-95'); }, 10); 
        }

        window.closeUserModal = function() {
            modalOverlay.classList.add('opacity-0'); modal.classList.add('scale-95'); 
            setTimeout(() => { modalOverlay.classList.add('hidden'); modal.classList.add('hidden'); }, 300); 
        }

        // ================= 💡 核心：云端写入新账号或编辑配置 =================
        window.saveUser = async function() {
            const enName = document.getElementById('ipt-enName').value.trim().toLowerCase();
            const displayName = document.getElementById('ipt-displayName').value.trim();
            const pwd = document.getElementById('ipt-pwd').value;
            const editKey = document.getElementById('edit-mode-key').value;

            if(!enName || !displayName) return customAlert('校验失败', '账号和展示名必填！', null, false, 'warning');

            const checkedPerms = Array.from(document.querySelectorAll('.perm-checkbox:checked')).map(cb => cb.value);
            if(checkedPerms.length === 0) return customAlert('校验失败', '必须至少勾选一个系统模块权限！', null, false, 'warning');

            let roleDesc = '业务需求方'; let color = 'bg-zinc-800';
            if(checkedPerms.includes('admin')) { roleDesc = '系统管理员'; color = 'bg-fuchsia-700'; }
            else if(checkedPerms.includes('design')) { roleDesc = '执行设计师'; color = 'bg-orange-600'; }

            const btn = document.getElementById('btn-save-user');
            const originalText = btn.innerText;
            btn.disabled = true; btn.innerText = "云端同步中...";

            try {
                if (editKey) {
                    // 编辑模式：如果密码没填就不更新密码字段
                    let updatePayload = {
                        cn_name: displayName,
                        display_name: displayName,
                        perms_json: JSON.stringify(checkedPerms),
                        role: roleDesc,
                        color: color
                    };
                    if (pwd) updatePayload.password = pwd;

                    const { error } = await window.supabase.from(window.DB_USERS_TABLE).update(updatePayload).eq('en_name', editKey);
                    if (error) throw error;
                    showToast('已更新', `成员 ${displayName} 权限与资料已保存至云端。`, 'success');
                } else {
                    // 新增模式
                    if(globalUsersDB[enName]) throw new Error('该企微英文名在库中已存在！');
                    if(!pwd) throw new Error('新增用户必须设置初始密码！');

                    const newRow = {
                        en_name: enName, cn_name: displayName, display_name: displayName, password: pwd,
                        perms_json: JSON.stringify(checkedPerms), role: roleDesc,
                        avatar: displayName.substring(0, 1).toUpperCase(), color: color
                    };
                    const { error } = await window.supabase.from(window.DB_USERS_TABLE).insert([newRow]);
                    if (error) throw error;
                    showToast('已创建', `新成员 ${displayName} 已加入系统并同步云端。`, 'success');
                }

                closeUserModal();
                // 刷新全量大盘
                window.loadUsersFromCloud();

            } catch (err) {
                customAlert('云端操作失败', err.message, null, false, 'error');
            } finally {
                btn.disabled = false; btn.innerText = originalText;
            }
        }

        // ================= 💡 核心：云端重置与删除 =================
        window.resetUserPwd = function(enName) {
            customConfirm('重置密码确认', `确定要将 @${enName} 的密码重置为默认的 <span class="text-white font-mono bg-zinc-800 px-1 rounded">123456</span> 吗？此操作将立即写入云端。`, async () => {
                try {
                    const { error } = await window.supabase.from(window.DB_USERS_TABLE).update({ password: '123456' }).eq('en_name', enName);
                    if (error) throw error;
                    showToast('密码已重置', '云端已更新，新密码为: 123456', 'success');
                    window.loadUsersFromCloud(); // 刷新本地内存
                } catch(e) { customAlert('错误', e.message, null, false, 'error'); }
            });
        }

        window.deleteUser = function(enName, displayName) {
            const userStr = localStorage.getItem('activeUserObj');
            if (userStr && JSON.parse(userStr).enName === enName) {
                return customAlert('系统保护', '您不能在后台删除当前正在登录的超级管理员账号本身！', null, false, 'warning');
            }

            customConfirm('危险操作', `确定要彻底移除成员 <span class="text-rose-500 font-bold">[ ${displayName} ]</span> 吗？<br>删除后该账号将立即失去云端系统访问权，且无法恢复。`, async () => {
                try {
                    const { error } = await window.supabase.from(window.DB_USERS_TABLE).delete().eq('en_name', enName);
                    if (error) throw error;
                    showToast('移除成功', '该账号已从系统云端吊销。', 'success');
                    window.loadUsersFromCloud();
                } catch(e) { customAlert('删除失败', e.message, null, false, 'error'); }
            }, 'danger');
        }

        function showToast(title, desc, type = 'success') {
            const toast = document.getElementById('action-toast');
            document.getElementById('toast-title').innerText = title;
            document.getElementById('toast-desc').innerText = desc;
            const icon = document.getElementById('toast-icon');
            if(type === 'success') {
                icon.className = "w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-fuchsia-500/20 text-fuchsia-400";
                icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            }
            toast.classList.remove('hidden');
            setTimeout(() => { toast.classList.add('hidden'); }, 3000);
        }

        document.addEventListener('DOMContentLoaded', () => {
            if(initRBAC()) setTimeout(()=> { if(window.supabase===undefined) document.getElementById('table-loading').classList.add('hidden'); }, 3000); 
        });
    </script>
</body>
</html>