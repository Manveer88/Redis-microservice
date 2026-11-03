import { Loader2 } from "lucide-react";

function PageLoader({ text = "Loading..." }) {
    return (
        <div className="page-loader">
            <div className="logo-icon">R</div>
            <div className="inline-loader">
                <Loader2 size={18} className="spin" /> {text}
            </div>
        </div>
    );
}

export default PageLoader;
