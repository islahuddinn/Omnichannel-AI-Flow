const InfoItem = ({ label, value, className = "" }) => {
    const displayValue = value == null || String(value) === "NaN" ? "-" : value;
    return (
        <div className={`${className}  px-[10px] py-2`}>
            <div className="text-[10px] text-muted-foreground font-normal mb-1">{label}</div>
            <div className="text-xs font-normal text-foreground">{displayValue}</div>
        </div>
    );
};

export default InfoItem;
