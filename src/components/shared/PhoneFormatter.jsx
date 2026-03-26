import React from 'react';

const parsePhoneNumber = (phoneNumber) => {
    if (!phoneNumber) return "";

    // First remove the '00' prefix if it exists and replace with '+'
    let cleaned = phoneNumber.replace(/^00/, '+');

    // If there's no '+' prefix, add it
    if (!cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
    }

    // Now remove all non-digit characters except the leading '+'
    cleaned = '+' + cleaned.slice(1).replace(/\D/g, "");

    // Define formatting rules for supported country codes
    const formats = [
        {
            code: "1",
            length: 11,
            format: (n) =>
                `+${n.slice(0, 1)} (${n.slice(1, 4)}) ${n.slice(4, 7)}-${n.slice(7)}`, // US/Canada
        },
        {
            code: "421", // Slovakia country code
            length: 12,
            format: (n) =>
                `+${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}`,
        },
        {
            code: "420",
            length: 12,
            format: (n) =>
                `+${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}`, // Czech Republic
        },
        {
            code: "91",
            length: 12,
            format: (n) => `+${n.slice(0, 2)} ${n.slice(2, 7)} ${n.slice(7)}`, // India
        },
        {
            code: "92",
            length: 12,
            format: (n) => `+${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`, // Pakistan
        },
        {
            code: "44",
            length: 12,
            format: (n) => `+${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`, // UK
        },
        {
            code: "86",
            length: 13,
            format: (n) =>
                `+${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 9)} ${n.slice(9)}`, // China
        },
    ];

    // Remove the '+' before checking formats
    const numbersOnly = cleaned.slice(1);

    // Check if the number matches a specific format
    for (const { code, length, format } of formats) {
        if (numbersOnly.startsWith(code) && numbersOnly.length === length) {
            return format(numbersOnly);
        }
    }

    // Fallback formatting
    if (numbersOnly.length === 10) {
        // Assume it's a US number without a country code
        return `+1 (${numbersOnly.slice(0, 3)}) ${numbersOnly.slice(3, 6)}-${numbersOnly.slice(6)}`;
    } else if (numbersOnly.length > 10) {
        // Generic international format for numbers longer than 10 digits
        return `+${numbersOnly.slice(0, 2)} ${numbersOnly.slice(2, 5)} ${numbersOnly.slice(5, 8)} ${numbersOnly.slice(8)}`;
    }

    // Return cleaned number with '+' prefix
    return cleaned;
};

const PhoneFormatter = ({ phoneNumber, className = "" }) => {
    if (!phoneNumber) return <span className={className}>-</span>;

    try {
        const formattedNumber = parsePhoneNumber(phoneNumber);
        return <span className={className}>{formattedNumber}</span>;
    } catch (error) {
        console.error("Error formatting phone number:", error);
        return <span className={className}>{phoneNumber}</span>;
    }
};

export default PhoneFormatter;
