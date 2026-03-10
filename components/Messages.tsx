import React, { useState, useEffect, useRef } from 'react';
import { Conversation, Message, User, Reaction } from '../types';
import { api, testRealtimeConnection, testRealtimeMessaging } from '../api';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

interface MessagesProps {
  conversations: Conversation[];
  onSendMessage?: (conversationId: string, content: string, replyToId?: string, image?: string) => void;
  currentUser: User;
  onUserClick?: (userId: string) => void;
}

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🔥', '👍', '🙏'];

const formatLastActive = (dateStr?: string) => {
    if (!dateStr) return 'Offline';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000); // seconds

    if (diff < 60) return 'Just now';
    if (diff < 120) return '1m ago'; // 2 mins is online threshold
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
};

const ChatList: React.FC<{
  conversations: Conversation[];
  onSelectChat: (id: string) => void;
  onCreateGroup: () => void;
  onJoinGroup: () => void;
  currentUser: User;
  onUserClick?: (userId: string) => void;
}> = ({ conversations, onSelectChat, onCreateGroup, onJoinGroup, currentUser, onUserClick }) => {
  const [filter, setFilter] = useState<'all' | 'groups'>('all');

  const filteredConversations = conversations.filter(c => {
    if (filter === 'groups') return c.isGroup;
    return true;
  });

  return (
  <div className="flex flex-col h-full bg-background relative">
    {/* Header */}
    <div className="p-4 pt-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-muted overflow-hidden border border-border">
          <img src={currentUser.avatar} alt="Me" className="w-full h-full object-cover" />
        </div>
        <div className="flex items-baseline gap-8">
          <button 
            onClick={() => setFilter('all')}
            className={`text-2xl font-bold transition-colors ${filter === 'all' ? 'text-primary underline decoration-primary underline-offset-8' : 'text-foreground hover:text-foreground/80'}`}
          >
            Chats
          </button>
          <button 
            onClick={() => setFilter('groups')}
            className={`text-2xl font-bold transition-colors ${filter === 'groups' ? 'text-primary underline decoration-primary underline-offset-8' : 'text-foreground hover:text-foreground/80'}`}
          >
            Groups
          </button>
        </div>
      </div>
      <div className="flex gap-2">
         <button 
           onClick={onJoinGroup}
           title="Join Group via ID"
           className="w-10 h-10 rounded-full bg-muted text-foreground flex items-center justify-center hover:bg-muted/80 transition-colors"
         >
           <i className="fas fa-link"></i>
         </button>
         <button 
            onClick={onCreateGroup}
            title="Create New Group"
            className="w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-transform active:scale-95"
         >
           <i className="fas fa-plus text-lg"></i>
         </button>
      </div>
    </div>

    {/* Search */}
    <div className="px-4 pb-4">
      <div className="relative">
        <input 
          type="text" 
          placeholder="Search" 
          className="w-full bg-muted/50 text-foreground placeholder:text-muted-foreground px-5 py-3 rounded-2xl border-none focus:ring-1 focus:ring-primary/50 outline-none"
        />
        <i className="fas fa-search absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"></i>
      </div>
    </div>

    {/* List */}
    <div className="flex-1 overflow-y-auto px-2 space-y-1 pb-4">
      {filteredConversations
        .slice()
        .sort((a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0))
        .map(conv => {
          const isGroup = conv.isGroup;
          const name = isGroup ? conv.groupName : conv.user?.name;
          const photo = isGroup ? conv.groupPhoto : conv.user?.avatar;
          
          // Online Status Logic
          const isOnline = !isGroup && conv.user?.isOnline;
          const lastActive = !isGroup ? formatLastActive(conv.user?.lastSeenAt as any) : '';

          return (
            <div 
              key={conv.id} 
              onClick={() => onSelectChat(conv.id)}
              className="flex items-center gap-4 p-3 rounded-2xl hover:bg-muted/30 cursor-pointer transition-colors group"
            >
              <div className="relative" onClick={(e) => {
                  if (!isGroup && conv.user && onUserClick) {
                      e.stopPropagation();
                      onUserClick(conv.user.id);
                  }
              }}>
                <img src={photo} alt={name} className="w-14 h-14 rounded-full object-cover border-2 border-background shadow-sm" />
                {isOnline && <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background animate-pulse"></div>}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-bold text-base text-foreground truncate pr-2 flex items-center gap-2">
                    {isGroup && <i className="fas fa-users text-xs text-muted-foreground"></i>}
                    {name}
                  </h3>
                  <span className={`text-[10px] font-medium ${conv.unreadCount && conv.unreadCount > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                    {conv.lastMessageTime}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <p className={`text-sm truncate pr-4 ${conv.unreadCount && conv.unreadCount > 0 ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>
                      {isGroup && conv.messages.length > 0 && !conv.messages[conv.messages.length - 1].isMe ? 
                         <span className="font-semibold text-foreground mr-1">{conv.messages[conv.messages.length-1].senderName}:</span> 
                         : null}
                      {conv.lastMessage}
                  </p>
                  {conv.unreadCount && conv.unreadCount > 0 ? (
                      <span className="bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">{conv.unreadCount}</span>
                  ) : !isGroup && !isOnline && (
                      <span className="text-[9px] text-muted-foreground opacity-60">{lastActive}</span>
                  )}
                </div>
              </div>
            </div>
          )
      })}
      {filteredConversations.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <p>No {filter === 'groups' ? 'groups' : 'chats'} found.</p>
        </div>
      )}
    </div>
  </div>
  );
};

const ChatDetail: React.FC<{
  chat: Conversation;
  onBack: () => void;
  onSendMessage: (content: string, replyToId?: string, image?: string) => void;
  onOpenGroupInfo: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onNewMessageReceived: (msg: Message) => void;
  currentUser: User;
  onUserClick?: (userId: string) => void;
}> = ({ chat, onBack, onSendMessage, onOpenGroupInfo, onReact, onNewMessageReceived, currentUser, onUserClick }) => {
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeReactionId, setActiveReactionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const EMOJIS = ['😀', '😂', '😍', '🥺', '😭', '😡', '👍', '👎', '🎉', '🔥', '❤️', '💔', '🤝', '👋'];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    // Mark as read when entering
    api.markConversationAsRead(chat.id);
  }, [chat.id, chat.messages.length]);

  // Real-time subscription for messages in this specific chat
  useEffect(() => {
      if (!chat.id) return;

      // Subscribe
      channelRef.current = api.subscribeToMessages(chat.id, (msg) => {
          onNewMessageReceived(msg);
          // Also mark as read if user is viewing this chat
          api.markConversationAsRead(chat.id);
          scrollToBottom();
      });

      return () => {
          if (channelRef.current) {
              channelRef.current.unsubscribe();
          }
      };
  }, [chat.id]);

  const handleSend = () => {
    if (newMessage.trim()) {
      onSendMessage(newMessage, replyTo?.id);
      setNewMessage('');
      setReplyTo(null);
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (ev) => {
              if (ev.target?.result) {
                  onSendMessage('', replyTo?.id, ev.target.result as string);
                  setReplyTo(null);
              }
          };
          reader.readAsDataURL(file);
          e.target.value = '';
      }
  };

  const name = chat.isGroup ? chat.groupName : chat.user?.name;
  const photo = chat.isGroup ? chat.groupPhoto : chat.user?.avatar;
  const isOnline = !chat.isGroup && chat.user?.isOnline;
  const lastActive = !chat.isGroup ? formatLastActive(chat.user?.lastSeenAt as any) : '';

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Chat Header */}
      <div className="p-4 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-4 cursor-pointer" onClick={chat.isGroup ? onOpenGroupInfo : (!chat.isGroup && chat.user && onUserClick ? () => onUserClick(chat.user!.id) : undefined)}>
          <button 
            onClick={(e) => { e.stopPropagation(); onBack(); }}
            className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
          >
            <i className="fas fa-arrow-left text-lg"></i>
          </button>
          <div className="relative">
            <img src={photo} alt={name} className="w-12 h-12 rounded-full object-cover" />
            {!chat.isGroup && isOnline && (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background"></div>
            )}
          </div>
          <div>
            <h2 className="font-bold text-lg leading-tight flex items-center gap-2">
                {name} 
                {chat.isGroup && <i className="fas fa-chevron-right text-xs text-muted-foreground"></i>}
            </h2>
            <p className="text-sm text-muted-foreground font-medium">
                {chat.isGroup 
                    ? `${chat.participants?.length || 0} members` 
                    : (isOnline ? 'Active Now' : `Active ${lastActive}`)
                }
            </p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
        <div className="text-center">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today</span>
        </div>

        {chat.messages.map((msg: Message) => (
          <div key={msg.id} className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'} group relative`}>
            {chat.isGroup && !msg.isMe && (
                <span className="text-[10px] text-muted-foreground ml-2 mb-1 font-semibold">{msg.senderName}</span>
            )}
            
            <div className={`max-w-[75%] relative ${msg.isMe ? 'flex flex-row-reverse' : 'flex flex-row'} items-end gap-2`}>
                {chat.isGroup && !msg.isMe && (
                     <img 
                        src={msg.senderAvatar} 
                        className="w-6 h-6 rounded-full mb-1 cursor-pointer" 
                        onClick={() => onUserClick && onUserClick(msg.senderId)}
                     />
                )}

                <div 
                    className={`relative px-5 py-3 rounded-2xl shadow-sm text-sm leading-relaxed transition-all ${
                    msg.isMe 
                    ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                    : 'bg-muted/80 text-foreground rounded-tl-sm'
                    }`}
                    onDoubleClick={() => setActiveReactionId(msg.id)}
                >
                    {/* Reply Quote Block */}
                    {msg.replyTo && (
                        <div className={`mb-2 p-2 rounded text-xs border-l-2 ${msg.isMe ? 'bg-black/10 border-white/50' : 'bg-black/5 border-primary/50'}`}>
                             <div className="font-bold opacity-80">{msg.replyTo.senderName}</div>
                             <div className="truncate opacity-70">{msg.replyTo.content}</div>
                        </div>
                    )}
                    
                    {/* Image Attachment */}
                    {msg.image && (
                        <div className="mb-2">
                            <img src={msg.image} alt="Attachment" className="rounded-lg max-h-60 object-cover" />
                        </div>
                    )}

                    {msg.content && <p>{msg.content}</p>}
                    <span className={`text-[10px] block text-right mt-1 opacity-70 ${msg.isMe ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                        {msg.timestamp}
                    </span>

                    {/* Reactions Display */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className={`absolute -bottom-3 ${msg.isMe ? 'right-2' : 'left-2'} flex gap-1 bg-card border border-border px-1.5 py-0.5 rounded-full shadow-sm`}>
                        {msg.reactions.map(r => (
                          <span key={r.emoji} className="text-[10px] flex items-center gap-1">
                            {r.emoji} <span className="font-bold text-muted-foreground">{r.count}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Quick Reaction Picker */}
                    {activeReactionId === msg.id && (
                      <div className={`absolute -top-10 ${msg.isMe ? 'right-0' : 'left-0'} flex gap-1 bg-card border border-border p-1.5 rounded-full shadow-xl z-10 animate-in fade-in zoom-in-90`}>
                        {REACTION_EMOJIS.map(emoji => (
                          <button 
                            key={emoji}
                            onClick={() => { onReact(msg.id, emoji); setActiveReactionId(null); }}
                            className="hover:scale-125 transition-transform p-0.5"
                          >
                            {emoji}
                          </button>
                        ))}
                        <button onClick={() => setActiveReactionId(null)} className="ml-1 text-muted-foreground"><i className="fas fa-times text-xs"></i></button>
                      </div>
                    )}
                </div>
                
                {/* Actions Button (Hover) */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                  <button 
                      onClick={() => setReplyTo(msg)}
                      className="p-1 text-muted-foreground hover:text-primary transition-colors"
                      title="Reply"
                  >
                      <i className="fas fa-reply text-xs"></i>
                  </button>
                  <button 
                      onClick={() => setActiveReactionId(activeReactionId === msg.id ? null : msg.id)}
                      className="p-1 text-muted-foreground hover:text-primary transition-colors"
                      title="React"
                  >
                      <i className="far fa-face-smile text-xs"></i>
                  </button>
                </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Banner */}
      {replyTo && (
           <div className="bg-muted/30 border-t border-b border-border p-3 flex justify-between items-center backdrop-blur-sm">
               <div className="flex-1 border-l-4 border-primary pl-3">
                   <div className="text-xs text-primary font-bold">Replying to {replyTo.senderName || 'User'}</div>
                   <div className="text-sm text-muted-foreground truncate">{replyTo.content || 'Photo'}</div>
               </div>
               <button onClick={() => setReplyTo(null)} className="p-2 text-muted-foreground hover:text-foreground">
                   <i className="fas fa-times"></i>
               </button>
           </div>
      )}

      {/* Input Footer */}
      <div className="p-4 pb-6 relative">
        {showEmojiPicker && (
            <div className="absolute bottom-24 left-4 bg-card border border-border rounded-xl shadow-xl p-3 grid grid-cols-7 gap-2 z-50 animate-in zoom-in-95 w-max">
                {EMOJIS.map(emoji => (
                    <button 
                        key={emoji} 
                        onClick={() => { setNewMessage(prev => prev + emoji); setShowEmojiPicker(false); }} 
                        className="text-2xl hover:bg-muted rounded p-1 transition-colors"
                    >
                        {emoji}
                    </button>
                ))}
            </div>
        )}

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={`transition-colors p-2 ${showEmojiPicker ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
          >
            <i className="far fa-smile text-xl"></i>
          </button>
          
          <div className="flex-1 relative">
            <input 
              type="text" 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={replyTo ? "Type your reply..." : "Type a message"} 
              className="w-full bg-zinc-700 text-white placeholder:text-zinc-400 px-4 py-3 pr-10 rounded-full focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <i className="fas fa-paperclip"></i>
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileSelect} 
            />
          </div>

          <button 
            onClick={handleSend}
            className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-transform active:scale-95 shadow-lg"
          >
            <i className="fas fa-paper-plane text-lg"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Modals ---

const CreateGroupModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, photo: string, members: string[]) => void;
}> = ({ isOpen, onClose, onSubmit }) => {
    const [groupName, setGroupName] = useState('');
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [filterName, setFilterName] = useState('');
    
    useEffect(() => {
        if(isOpen) api.getAllUsers().then(setUsers);
    }, [isOpen]);

    if (!isOpen) return null;

    const toggleUser = (id: string) => {
        setSelectedUsers(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]);
    };

    const handleSubmit = () => {
        if (!groupName) return alert("Group name is required");
        onSubmit(groupName, '', selectedUsers);
        onClose();
        setGroupName('');
        setSelectedUsers([]);
    };

    const filteredUsers = users.filter(u => u.name.toLowerCase().includes(filterName.toLowerCase()));

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-md rounded-xl p-6 animate-in zoom-in-95">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold">New Group</h3>
                    <button onClick={onClose}><i className="fas fa-times"></i></button>
                </div>
                
                <div className="space-y-4">
                    <div className="flex justify-center mb-4">
                        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center text-muted-foreground border border-dashed border-border">
                            <i className="fas fa-camera text-2xl"></i>
                        </div>
                    </div>

                    <input 
                        type="text" 
                        placeholder="Group Name" 
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg bg-background border border-input focus:ring-1 focus:ring-primary outline-none"
                    />

                    <div className="max-h-60 border border-border rounded-lg p-2 space-y-2 flex flex-col">
                        <input 
                            type="text" 
                            placeholder="Search people..." 
                            value={filterName}
                            onChange={(e) => setFilterName(e.target.value)}
                            className="w-full px-3 py-1.5 mb-2 rounded bg-muted/50 border-none text-xs focus:ring-0"
                        />
                        <p className="text-xs text-muted-foreground font-bold px-2">MEMBERS ({selectedUsers.length})</p>
                        <div className="overflow-y-auto flex-1 space-y-1">
                            {filteredUsers.map(user => (
                                <div key={user.id} onClick={() => toggleUser(user.id)} className="flex items-center gap-3 p-2 hover:bg-muted rounded-lg cursor-pointer">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedUsers.includes(user.id) ? 'bg-primary border-primary' : 'border-muted-foreground'}`}>
                                        {selectedUsers.includes(user.id) && <i className="fas fa-check text-white text-xs"></i>}
                                    </div>
                                    <img src={user.avatar} className="w-8 h-8 rounded-full object-cover" alt={user.name} />
                                    <span className="text-sm font-medium">{user.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button 
                        onClick={handleSubmit}
                        className="w-full bg-primary text-primary-foreground py-2 rounded-lg font-bold hover:bg-primary/90"
                    >
                        Create Group
                    </button>
                </div>
            </div>
        </div>
    );
};

const GroupInfoModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    group: Conversation;
    onAddMember: (userId: string) => void;
    onRemoveMember: (userId: string) => void;
    onLeaveGroup: () => void;
    currentUser: User;
    onUserClick?: (userId: string) => void;
}> = ({ isOpen, onClose, group, onAddMember, onRemoveMember, onLeaveGroup, currentUser, onUserClick }) => {
    const [isAddMode, setIsAddMode] = useState(false);
    const [availableUsers, setAvailableUsers] = useState<User[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if(isOpen && isAddMode) {
            api.getAllUsers().then(users => {
                const participants = new Set(group.participants?.map(p => p.id));
                setAvailableUsers(users.filter(u => !participants.has(u.id)));
            });
        }
    }, [isOpen, isAddMode, group]);
    
    if (!isOpen) return null;

    const isOwner = group.ownerId === currentUser.id;
    const filteredAvailable = availableUsers.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-md rounded-xl p-6 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold">Group Info</h3>
                    <button onClick={onClose}><i className="fas fa-times"></i></button>
                </div>

                <div className="text-center mb-6">
                    <img src={group.groupPhoto} className="w-24 h-24 rounded-full mx-auto mb-3 object-cover border-4 border-background shadow-lg" alt={group.groupName} />
                    <h2 className="text-2xl font-bold">{group.groupName}</h2>
                    <p className="text-muted-foreground text-sm">{group.participants?.length} members</p>
                    <div className="mt-2 text-xs bg-muted py-1 px-3 rounded-full inline-block select-all">
                        ID: <span className="font-mono">{group.id}</span>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                         <h4 className="font-bold text-sm text-muted-foreground">PARTICIPANTS</h4>
                         {isOwner && (
                             <button onClick={() => setIsAddMode(!isAddMode)} className="text-primary text-xs font-bold hover:underline">
                                 {isAddMode ? 'CANCEL' : 'ADD PARTICIPANT'}
                             </button>
                         )}
                    </div>

                    {isAddMode && (
                        <div className="bg-muted/30 p-2 rounded-lg mb-2 space-y-2">
                            <input 
                                type="text" 
                                placeholder="Search user..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full text-xs p-2 rounded border border-border"
                            />
                            <div className="max-h-32 overflow-y-auto">
                                {filteredAvailable.length === 0 ? <p className="text-xs text-center p-2 text-muted-foreground">No users found</p> : 
                                filteredAvailable.map(u => (
                                    <div key={u.id} className="flex justify-between items-center p-2 hover:bg-muted rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <img src={u.avatar} className="w-6 h-6 rounded-full object-cover" alt={u.name}/>
                                            <span className="text-sm">{u.name}</span>
                                        </div>
                                        <button onClick={() => { onAddMember(u.id); setIsAddMode(false); }} className="text-primary text-xs font-bold hover:bg-primary/10 p-1 rounded"><i className="fas fa-plus"></i> ADD</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {group.participants?.map(p => (
                            <div key={p.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                                <div className="flex items-center gap-3 cursor-pointer" onClick={() => onUserClick && onUserClick(p.id)}>
                                    <img src={p.avatar} alt={p.name} className="w-10 h-10 rounded-full object-cover" />
                                    <div>
                                        <div className="font-medium text-sm">
                                            {p.name} {p.id === currentUser.id && '(You)'}
                                        </div>
                                        {p.id === group.ownerId && <span className="text-[10px] text-primary font-bold">Owner</span>}
                                    </div>
                                </div>
                                {isOwner && p.id !== currentUser.id && (
                                    <button onClick={() => onRemoveMember(p.id)} className="text-destructive hover:bg-destructive/10 p-2 rounded transition-colors" title="Remove">
                                        <i className="fas fa-trash-alt"></i>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="pt-6 border-t border-border">
                        <button 
                            onClick={onLeaveGroup}
                            className="w-full py-3 text-destructive font-bold bg-destructive/10 rounded-lg hover:bg-destructive/20 transition-colors"
                        >
                            <i className="fas fa-sign-out-alt mr-2"></i> Leave Group
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const JoinGroupModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onJoin: (id: string) => void;
}> = ({ isOpen, onClose, onJoin }) => {
    const [id, setId] = useState('');
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
             <div className="bg-card w-full max-w-sm rounded-xl p-6 animate-in zoom-in-95">
                 <h3 className="text-lg font-bold mb-4">Join Group</h3>
                 <input 
                    type="text" 
                    placeholder="Enter Group ID" 
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    className="w-full px-4 py-2 border border-input rounded-lg mb-4 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                 />
                 <div className="flex gap-2">
                     <button onClick={onClose} className="flex-1 py-2 border border-border rounded-lg hover:bg-muted">Cancel</button>
                     <button onClick={() => { onJoin(id); onClose(); }} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">Join</button>
                 </div>
             </div>
        </div>
    );
}

// --- Main Component ---

const Messages: React.FC<MessagesProps> = ({ conversations: initialConversations, onSendMessage, currentUser, onUserClick }) => {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [conversations, setConversations] = useState(initialConversations);
  
  // Modal States
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [isJoinGroupOpen, setIsJoinGroupOpen] = useState(false);

  // Sync props state
  useEffect(() => {
      setConversations(initialConversations);
  }, [initialConversations]);

  // Presence Subscription (Listen for Online Status Changes)
  useEffect(() => {
      const channel = supabase.channel('online-users')
          .on(
              'postgres_changes', 
              { event: 'UPDATE', schema: 'public', table: 'profiles' }, 
              (payload) => {
                  const updatedProfile = payload.new;
                  setConversations(prev => prev.map(c => {
                      // Update for DM partner
                      if (!c.isGroup && c.user?.id === updatedProfile.id) {
                          return { 
                              ...c, 
                              user: { 
                                  ...c.user, 
                                  isOnline: (Date.now() - new Date(updatedProfile.last_seen_at).getTime()) < 120000, 
                                  lastSeenAt: updatedProfile.last_seen_at 
                              } as any
                          };
                      }
                      return c;
                  }));
              }
          )
          .subscribe();

      return () => { supabase.removeChannel(channel); };
  }, []);

  // Global Conversation Listener: Syncs the list when any conversation updates (e.g. new message)
  useEffect(() => {
      const channel = supabase.channel('conversation-updates')
          .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'conversations' },
              async () => {
                  // Optimistic or Fetch: To ensure 100% data integrity, we re-fetch the list
                  // This guarantees we have the latest message content which is joined in api.getConversations
                  try {
                      const latestConvs = await api.getConversations();
                      setConversations(latestConvs);
                  } catch(e) {
                      console.error("Failed to sync conversations list", e);
                  }
              }
          )
          .subscribe();

      return () => { supabase.removeChannel(channel); };
  }, []);

  const activeChat = conversations.find(c => c.id === activeChatId);

  // Handle incoming live messages for the ACTIVE chat window
  const handleNewMessageReceived = (msg: Message) => {
      setConversations(prev => prev.map(c => {
          if (c.id === activeChatId) {
              // Append message if not exists
              if (!c.messages.some(m => m.id === msg.id)) {
                  return {
                      ...c,
                      messages: [...c.messages, msg],
                      lastMessage: msg.content || (msg.image ? 'Image' : 'New Message'),
                      lastMessageTime: msg.timestamp,
                      lastMessageTimestamp: Date.now()
                  };
              }
          } 
          return c;
      }));
  };

  const handleReact = async (messageId: string, emoji: string) => {
    // Placeholder: Reactions would need a DB table update
    // Currently UI only
    if (!activeChatId) return;
    
    // Optimistic Update
    setConversations(prev => prev.map(c => {
      if (c.id === activeChatId) {
        const newMessages = c.messages.map(m => {
          if (m.id === messageId) {
            const currentReactions = m.reactions || [];
            const existingIdx = currentReactions.findIndex(r => r.emoji === emoji);
            
            let updatedReactions: Reaction[] = [...currentReactions];
            if (existingIdx > -1) {
              const reaction = updatedReactions[existingIdx];
              if (reaction.userIds.includes(currentUser.id)) {
                // Remove reaction
                const newUserIds = reaction.userIds.filter(id => id !== currentUser.id);
                if (newUserIds.length === 0) {
                  updatedReactions = updatedReactions.filter(r => r.emoji !== emoji);
                } else {
                  updatedReactions[existingIdx] = { ...reaction, userIds: newUserIds, count: newUserIds.length };
                }
              } else {
                // Add to existing
                updatedReactions[existingIdx] = { 
                  ...reaction, 
                  userIds: [...reaction.userIds, currentUser.id], 
                  count: reaction.count + 1 
                };
              }
            } else {
              // New reaction
              updatedReactions.push({ emoji, count: 1, userIds: [currentUser.id] });
            }
            return { ...m, reactions: updatedReactions };
          }
          return m;
        });
        return { ...c, messages: newMessages };
      }
      return c;
    }));
  };

  const handleCreateGroup = async (name: string, photo: string, members: string[]) => {
      try {
        const newGroup = await api.createGroup(name, photo, members);
        setConversations(prev => [newGroup, ...prev]);
        setIsCreateGroupOpen(false);
        setActiveChatId(newGroup.id);
      } catch (e) {
        console.error(e);
        alert("Failed to create group");
      }
  };

  const handleJoinGroup = async (id: string) => {
      try {
          const joinedGroup = await api.joinGroup(id);
          if (joinedGroup && joinedGroup.id) {
             setConversations(prev => [joinedGroup, ...prev]);
             setActiveChatId(joinedGroup.id);
          }
          setIsJoinGroupOpen(false);
      } catch (e) {
          alert("Failed to join group. ID might be invalid.");
      }
  };

  const handleLeaveGroup = async () => {
      if (!activeChatId) return;
      if (confirm("Are you sure you want to leave this group?")) {
          try {
            await api.leaveGroup(activeChatId);
            setConversations(prev => prev.filter(c => c.id !== activeChatId));
            setActiveChatId(null);
            setIsGroupInfoOpen(false);
          } catch(e) {
              alert("Failed to leave group");
          }
      }
  };

  const handleAddMember = async (userId: string) => {
      if (!activeChat) return;
      try {
          await api.addGroupMember(activeChat.id, userId);
          // Refresh list to update participants
          const updated = await api.getConversations();
          setConversations(updated);
      } catch (e) {
          alert("Failed to add member");
      }
  };

  const handleRemoveMember = async (userId: string) => {
      if (!activeChat) return;
      if (!confirm("Remove user from group?")) return;
      try {
          await api.removeGroupMember(activeChat.id, userId);
          // Refresh list
          const updated = await api.getConversations();
          setConversations(updated);
      } catch (e) {
          alert("Failed to remove member");
      }
  };

  return (
    <div className="h-screen w-full overflow-hidden bg-background">
      <CreateGroupModal 
        isOpen={isCreateGroupOpen} 
        onClose={() => setIsCreateGroupOpen(false)} 
        onSubmit={handleCreateGroup}
      />
      <JoinGroupModal 
        isOpen={isJoinGroupOpen} 
        onClose={() => setIsJoinGroupOpen(false)} 
        onJoin={handleJoinGroup}
      />
      {activeChat && activeChat.isGroup && (
          <GroupInfoModal 
            isOpen={isGroupInfoOpen}
            onClose={() => setIsGroupInfoOpen(false)}
            group={activeChat}
            onAddMember={handleAddMember}
            onRemoveMember={handleRemoveMember}
            onLeaveGroup={handleLeaveGroup}
            currentUser={currentUser}
            onUserClick={onUserClick}
          />
      )}

      {activeChatId && activeChat ? (
        <ChatDetail 
          chat={activeChat} 
          onBack={() => setActiveChatId(null)}
          onSendMessage={(content, replyToId, image) => onSendMessage && onSendMessage(activeChatId, content, replyToId, image)}
          onOpenGroupInfo={() => setIsGroupInfoOpen(true)}
          onReact={handleReact}
          onNewMessageReceived={handleNewMessageReceived}
          currentUser={currentUser}
          onUserClick={onUserClick}
        />
      ) : (
        <ChatList 
          conversations={conversations} 
          onSelectChat={setActiveChatId} 
          onCreateGroup={() => setIsCreateGroupOpen(true)}
          onJoinGroup={() => setIsJoinGroupOpen(true)}
          currentUser={currentUser}
          onUserClick={onUserClick}
        />
      )}
    </div>
  );
};

export default Messages;
