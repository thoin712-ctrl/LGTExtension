export const parseDelimitedText = (text) => {
    const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Don't split by lines yet - we need to handle quoted fields with newlines
    if (!raw.trim()) return [];
    
    const countDelimiter = (line, delimiter) => {
        let count = 0, inQuotes = false, fieldStart = true;
        for (let i = 0; i < line.length; i += 1) {
            const ch = line[i];
            if (!inQuotes && ch === delimiter) { count += 1; fieldStart = true; continue; }
            if (ch === '"') {
                if (inQuotes) {
                    if (line[i + 1] === '"') i += 1;
                    else inQuotes = false;
                    fieldStart = false;
                    continue;
                }
                if (fieldStart) { inQuotes = true; fieldStart = false; continue; }
            }
            fieldStart = false;
        }
        return count;
    };
    
    // Sample first few lines to detect delimiter
    const sampleLines = raw.split('\n').slice(0, 12).filter(l => l.trim() !== '');
    const candidates = ['\t', ';', ','];
    const scores = candidates.map(d => {
        let linesWith = 0, total = 0;
        for (const line of sampleLines) {
            const c = countDelimiter(line, d);
            if (c > 0) linesWith += 1;
            total += c;
        }
        return { d, linesWith, total };
    });
    scores.sort((a, b) => (b.linesWith - a.linesWith) || (b.total - a.total) || (a.d === '\t' ? -1 : b.d === '\t' ? 1 : 0));
    const best = scores[0];
    const delimiter = best && best.total > 0 ? best.d : (raw.includes('\t') ? '\t' : ',');
    
    // Parse rows while respecting quoted fields that may contain newlines
    const rows = [];
    let i = 0;
    while (i < raw.length) {
        const out = [];
        let current = '', inQuotes = false, fieldStart = true;
        
        while (i < raw.length) {
            const ch = raw[i];
            
            if (ch === '"') {
                if (inQuotes) {
                    if (raw[i + 1] === '"') { current += '"'; i += 2; continue; }
                    else { inQuotes = false; i += 1; fieldStart = false; continue; }
                }
                if (fieldStart) { inQuotes = true; i += 1; fieldStart = false; continue; }
                current += '"'; i += 1; fieldStart = false; continue;
            }
            
            // Replace newlines within quotes with space
            if (inQuotes && (ch === '\n' || ch === '\r')) {
                current += ' ';
                i += 1;
                continue;
            }
            
            if (!inQuotes && ch === delimiter) { 
                out.push(current);
                current = '';
                fieldStart = true;
                i += 1;
                continue;
            }
            
            if (!inQuotes && ch === '\n') {
                out.push(current);
                current = '';
                fieldStart = true;
                i += 1;
                break;
            }
            
            current += ch;
            fieldStart = false;
            i += 1;
        }
        
        if (current !== '' || out.length > 0) {
            out.push(current);
            const trimmed = out.map(c => String(c == null ? '' : c).trim());
            if (trimmed.some(c => c !== '')) {
                rows.push(trimmed);
            }
        }
    }
    
    return rows;
};
