import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const openModals = [];

function Modal({ title, subtitle, onClose, children, footer, size = "md" }) {
    const closeRef = useRef(onClose);

    useEffect(() => {
        closeRef.current = onClose;
    });

    useEffect(() => {
        const token = {};
        openModals.push(token);

        const handleKey = (event) => {
            if (event.key === "Escape" && openModals[openModals.length - 1] === token) {
                closeRef.current?.();
            }
        };

        document.addEventListener("keydown", handleKey);

        return () => {
            document.removeEventListener("keydown", handleKey);
            openModals.splice(openModals.indexOf(token), 1);
        };
    }, []);

    return (
        <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
            <div className={`modal modal-${size}`} role="dialog" aria-modal="true">
                <div className="modal-header">
                    <div>
                        <h3>{title}</h3>
                        {subtitle && <p>{subtitle}</p>}
                    </div>
                    <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
                        <X size={17} />
                    </button>
                </div>
                <div className="modal-body">{children}</div>
                {footer && <div className="modal-footer">{footer}</div>}
            </div>
        </div>
    );
}

export default Modal;
