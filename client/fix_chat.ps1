$c = Get-Content -Raw src/pages/Chat.jsx
$c = $c.Replace('className="wa-chat-messages-area"', 'className="wa-chat-messages-area no-bg"')
$c = $c.Replace('className="wa-chat-header" style={{ background: "white" }}', 'className="wa-chat-header" style={{ background: "transparent" }}')
$c = $c.Replace('className="wa-pinned-messages-banner" style={{ background: "white"', 'className="wa-pinned-messages-banner" style={{ background: "rgba(255, 255, 255, 0.85)", backdropFilter: "blur(8px)"')
Set-Content src/pages/Chat_mod.jsx $c
