import React, { useState, useEffect, useRef } from "react";
import {
  FaBell,
  FaBullhorn,
  FaCalendarAlt,
  FaExclamationTriangle,
  FaInfoCircle,
  FaCheckDouble,
  FaTimes,
  FaClock,
  FaExternalLinkAlt,
  FaCheck,
} from "react-icons/fa";
import { formatTimeRemaining } from "../services/notificationService";

function getTimeAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr).getTime();
  if (isNaN(d)) return "";
  const diff = Date.now() - d;
  if (diff < 60 * 1000) return "Just now";
  const mins = Math.floor(diff / (60 * 1000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function NotificationCenterPopover({
  isOpen,
  onClose,
  notifications = [],
  readIds = [],
  onMarkAsRead,
  onMarkAllAsRead,
  onNavigate,
}) {
  const [filterTab, setFilterTab] = useState("all"); // 'all' | 'unread'
  const popoverRef = useRef(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }

    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        const bellBtn = document.querySelector(".header-action-icon-btn[title='Notifications']");
        if (bellBtn && bellBtn.contains(e.target)) return;
        onClose?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const readSet = new Set(readIds);
  const unreadCount = notifications.filter((n) => !readSet.has(n.id)).length;
  const filteredList =
    filterTab === "unread" ? notifications.filter((n) => !readSet.has(n.id)) : notifications;

  const renderTypeIcon = (type) => {
    switch (type) {
      case "exam":
        return <FaCalendarAlt className="notif-type-icon notif-type-exam" />;
      case "urgent":
        return <FaExclamationTriangle className="notif-type-icon notif-type-urgent" />;
      case "info":
        return <FaInfoCircle className="notif-type-icon notif-type-info" />;
      default:
        return <FaBullhorn className="notif-type-icon notif-type-announcement" />;
    }
  };

  return (
    <div className="notif-popover-card" ref={popoverRef} role="dialog" aria-label="Notifications">
      {/* Popover Header */}
      <div className="notif-popover-header">
        <div className="notif-popover-title-row">
          <div className="notif-popover-title-wrap">
            <FaBell className="notif-header-bell-icon" />
            <h3 className="notif-popover-heading">Notifications</h3>
            {unreadCount > 0 && (
              <span className="notif-popover-unread-pill">{unreadCount} new</span>
            )}
          </div>
          <div className="notif-popover-actions">
            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-mark-all-btn"
                onClick={onMarkAllAsRead}
                title="Mark all as read"
              >
                <FaCheckDouble style={{ fontSize: "11px" }} />
                <span>Mark all read</span>
              </button>
            )}
            <button
              type="button"
              className="notif-close-btn"
              onClick={onClose}
              title="Close notifications"
            >
              <FaTimes />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="notif-filter-tabs">
          <button
            type="button"
            className={`notif-tab-btn ${filterTab === "all" ? "active" : ""}`}
            onClick={() => setFilterTab("all")}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            className={`notif-tab-btn ${filterTab === "unread" ? "active" : ""}`}
            onClick={() => setFilterTab("unread")}
          >
            Unread ({unreadCount})
          </button>
        </div>
      </div>

      {/* Popover Scrollable Body */}
      <div className="notif-popover-list-scroll">
        {filteredList.length === 0 ? (
          <div className="notif-empty-state">
            <div className="notif-empty-icon-wrap">
              <FaBell />
            </div>
            <p className="notif-empty-title">
              {filterTab === "unread" ? "All caught up!" : "No active notifications"}
            </p>
            <p className="notif-empty-subtitle">
              {filterTab === "unread"
                ? "You have no unread notifications at the moment."
                : "Scheduled exam notices, announcements, and campus updates will appear here."}
            </p>
          </div>
        ) : (
          filteredList.map((item) => {
            const isUnread = !readSet.has(item.id);
            const timeRemaining = formatTimeRemaining(item.expiresAt);
            const isExpiringSoon =
              item.expiresAt &&
              new Date(item.expiresAt).getTime() - Date.now() < 2 * 60 * 60 * 1000;

            return (
              <div
                key={item.id}
                className={`notif-item-card ${isUnread ? "unread" : "read"} ${
                  item.priority === "urgent" ? "priority-urgent" : ""
                }`}
                onClick={() => onMarkAsRead?.(item.id)}
              >
                <div className="notif-item-icon-col">{renderTypeIcon(item.type)}</div>

                <div className="notif-item-content">
                  <div className="notif-item-top-row">
                    <span className={`notif-type-tag tag-${item.type || "announcement"}`}>
                      {(item.type || "announcement").toUpperCase()}
                    </span>

                    {item.expiresAt && (
                      <span
                        className={`notif-expiry-badge ${isExpiringSoon ? "expiring-soon" : ""}`}
                        title={`Expires at: ${new Date(item.expiresAt).toLocaleString()}`}
                      >
                        <FaClock style={{ fontSize: "9px", marginRight: "3px" }} />
                        {timeRemaining}
                      </span>
                    )}

                    <span className="notif-time-ago">{getTimeAgo(item.createdAt)}</span>
                    {isUnread && <span className="notif-unread-dot" title="Unread notification" />}
                  </div>

                  <h4 className="notif-item-title">{item.title}</h4>
                  <p className="notif-item-message">{item.message}</p>

                  {item.actionUrl && (
                    <button
                      type="button"
                      className="notif-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkAsRead?.(item.id);
                        onClose?.();
                        if (onNavigate) {
                          onNavigate(item.actionUrl);
                        } else {
                          window.location.href = item.actionUrl;
                        }
                      }}
                    >
                      <span>{item.actionLabel || "View Details"}</span>
                      <FaExternalLinkAlt style={{ fontSize: "10px" }} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Popover Footer */}
      <div className="notif-popover-footer">
        <span className="notif-footer-live-dot" />
        <span className="notif-footer-live-text">Real-time alerts • SEED Platform</span>
      </div>
    </div>
  );
}
