export function generateEmailPatterns(fullName: string, domain: string): string[] {
    if (!fullName || !domain || fullName === 'Unknown Name' || fullName === 'Unknown') {
        return [];
    }

    const cleanDomain = domain.toLowerCase().trim();
    // Normalize Unicode: decompose accented chars (NFD) then strip diacritical marks,
    // then remove any remaining non-ASCII characters to prevent corrupted patterns.
    const cleanedName = fullName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // Strip combining diacritical marks
        .replace(/[^\x20-\x7E]/g, '')     // Strip remaining non-ASCII
        .replace(/[^\w\s-]/g, '')          // Strip special chars (keep alphanumeric, space, hyphen)
        .trim()
        .toLowerCase();
    
    if (!cleanedName) return [];

    const parts = cleanedName.split(/\s+/);
    
    if (parts.length === 1) {
        // Single name (e.g., just "John")
        return [
            `${parts[0]}@${cleanDomain}`
        ];
    }

    const firstName = parts[0];
    const lastName = parts[parts.length - 1]; // Use last part as last name
    const firstInitial = firstName.charAt(0);

    const patterns = [
        `${firstName}@${cleanDomain}`,
        `${firstInitial}.${lastName}@${cleanDomain}`,
        `${firstName}.${lastName}@${cleanDomain}`,
        `${firstInitial}${lastName}@${cleanDomain}`
    ];

    // Deduplicate patterns in case of weird names
    return [...new Set(patterns)];
}
