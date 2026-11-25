package com.pocketai.retrieval;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.util.Log;

import java.util.*;

/**
 * On-Device Contact RAG (Retrieval-Augmented Generation) Retriever.
 * Indexes phone contacts into an in-memory document store with Character Trigrams,
 * Token Jaccard overlap, and Semantic Relationship Classification.
 */
public class ContactRAGRetriever {
    private static final String TAG = "ContactRAG";

    // Common family and relative markers in Indian / Tamil / English contact lists
    private static final Set<String> RELATIVE_KEYWORDS = new HashSet<>(Arrays.asList(
        "amma", "mom", "mother", "mummy", "thaai",
        "appa", "dad", "father", "daddy", "thathaa",
        "chithi", "chithappa", "mama", "mami", "mams",
        "periyappa", "periyamma",
        "anna", "akka", "thambi", "thangachi", "bro", "brother", "sister"
    ));

    // Common educational / departmental / institutional qualifiers
    private static final Set<String> AFFILIATION_KEYWORDS = new HashSet<>(Arrays.asList(
        "bit", "aiml", "cse", "it", "mech", "ece", "eee", "civil", "mba",
        "college", "school", "office", "work", "hostel", "turf", "trinity"
    ));

    public static class ContactDocument {
        public String displayName;
        public String phoneNumber;
        public String cleanName;
        public Set<String> tokens;
        public Map<String, Integer> trigrams;
        public boolean hasRelativeMarker;
        public boolean hasAffiliationMarker;

        public ContactDocument(String displayName, String phoneNumber) {
            this.displayName = displayName != null ? displayName : "";
            this.phoneNumber = phoneNumber != null ? phoneNumber : "";
            this.cleanName = normalize(this.displayName);
            this.tokens = extractTokens(this.cleanName);
            this.trigrams = extractTrigrams(this.cleanName);
            this.hasRelativeMarker = checkRelative(this.tokens);
            this.hasAffiliationMarker = checkAffiliation(this.tokens);
        }

        private static boolean checkRelative(Set<String> toks) {
            for (String t : toks) {
                if (RELATIVE_KEYWORDS.contains(t)) return true;
            }
            return false;
        }

        private static boolean checkAffiliation(Set<String> toks) {
            for (String t : toks) {
                if (AFFILIATION_KEYWORDS.contains(t)) return true;
            }
            return false;
        }
    }

    public static class ScoredContact implements Comparable<ScoredContact> {
        public ContactDocument doc;
        public double score;
        public String rationale;

        public ScoredContact(ContactDocument doc, double score, String rationale) {
            this.doc = doc;
            this.score = score;
            this.rationale = rationale;
        }

        @Override
        public int compareTo(ScoredContact o) {
            return Double.compare(o.score, this.score); // Descending
        }
    }

    public static class RAGResult {
        public ContactDocument bestMatch;
        public double confidence;
        public List<ScoredContact> topCandidates;

        public RAGResult(ContactDocument bestMatch, double confidence, List<ScoredContact> topCandidates) {
            this.bestMatch = bestMatch;
            this.confidence = confidence;
            this.topCandidates = topCandidates;
        }
    }

    /**
     * Clean and normalize string: lowercase, remove emojis and special characters.
     */
    public static String normalize(String input) {
        if (input == null) return "";
        // Replace emojis, symbols, and punctuation with spaces
        String stripped = input.replaceAll("[^a-zA-Z0-9\\s]", " ").toLowerCase().trim();
        return stripped.replaceAll("\\s+", " ");
    }

    /**
     * Extract unique word tokens from string.
     */
    public static Set<String> extractTokens(String normalized) {
        Set<String> tokens = new HashSet<>();
        if (normalized == null || normalized.isEmpty()) return tokens;
        String[] parts = normalized.split("\\s+");
        for (String p : parts) {
            if (!p.isEmpty()) tokens.add(p);
        }
        return tokens;
    }

    /**
     * Extract character trigrams (shingles) for phonetic & typo resilience.
     */
    public static Map<String, Integer> extractTrigrams(String normalized) {
        Map<String, Integer> bag = new HashMap<>();
        if (normalized == null || normalized.length() < 2) return bag;
        String padded = "^" + normalized + "$";
        for (int i = 0; i <= padded.length() - 3; i++) {
            String tri = padded.substring(i, i + 3);
            bag.put(tri, bag.getOrDefault(tri, 0) + 1);
        }
        return bag;
    }

    /**
     * Compute cosine similarity between two trigram bags.
     */
    private static double computeTrigramCosine(Map<String, Integer> v1, Map<String, Integer> v2) {
        if (v1.isEmpty() || v2.isEmpty()) return 0.0;
        double dotProduct = 0.0;
        double norm1 = 0.0;
        double norm2 = 0.0;

        for (int count : v1.values()) norm1 += count * count;
        for (int count : v2.values()) norm2 += count * count;

        for (Map.Entry<String, Integer> entry : v1.entrySet()) {
            Integer c2 = v2.get(entry.getKey());
            if (c2 != null) {
                dotProduct += entry.getValue() * c2;
            }
        }

        if (norm1 == 0 || norm2 == 0) return 0.0;
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    /**
     * Compute Jaccard overlap between two token sets.
     */
    private static double computeTokenJaccard(Set<String> s1, Set<String> s2) {
        if (s1.isEmpty() && s2.isEmpty()) return 1.0;
        if (s1.isEmpty() || s2.isEmpty()) return 0.0;

        int intersection = 0;
        for (String item : s1) {
            if (s2.contains(item)) intersection++;
        }
        int union = s1.size() + s2.size() - intersection;
        return union == 0 ? 0.0 : ((double) intersection / union);
    }

    /**
     * Check if query contains any relative marker.
     */
    private static boolean queryHasRelative(Set<String> queryTokens) {
        for (String q : queryTokens) {
            if (RELATIVE_KEYWORDS.contains(q)) return true;
        }
        return false;
    }

    /**
     * Query all contacts matching filter from Android ContentResolver and rank using RAG model.
     */
    public static RAGResult retrieveBestContact(ContentResolver cr, String query) {
        if (query == null || query.trim().isEmpty()) {
            return new RAGResult(null, 0.0, Collections.emptyList());
        }

        String cleanQuery = normalize(query);
        Set<String> queryTokens = extractTokens(cleanQuery);
        Map<String, Integer> queryTrigrams = extractTrigrams(cleanQuery);
        boolean qWantsRelative = queryHasRelative(queryTokens);

        // First token for broad content resolver filter
        String[] qParts = cleanQuery.split("\\s+");
        String firstWord = qParts.length > 0 ? qParts[0] : cleanQuery;

        List<ContactDocument> docs = new ArrayList<>();
        Uri queryUri = Uri.withAppendedPath(
            ContactsContract.CommonDataKinds.Phone.CONTENT_FILTER_URI,
            Uri.encode(firstWord)
        );

        String[] projection = new String[]{
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME
        };

        try (Cursor cursor = cr.query(queryUri, projection, null, null, null)) {
            if (cursor != null) {
                int numberIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                int nameIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);

                while (cursor.moveToNext()) {
                    String num = numberIdx != -1 ? cursor.getString(numberIdx) : "";
                    String name = nameIdx != -1 ? cursor.getString(nameIdx) : "";
                    if (num != null && !num.trim().isEmpty()) {
                        docs.add(new ContactDocument(name, num));
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Content resolver query error: " + e.getMessage());
        }

        // Fallback: If filter by first word returned nothing, query whole phone contacts
        if (docs.isEmpty()) {
            try (Cursor cursor = cr.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, projection, null, null, null)) {
                if (cursor != null) {
                    int numberIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                    int nameIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                    while (cursor.moveToNext()) {
                        String num = numberIdx != -1 ? cursor.getString(numberIdx) : "";
                        String name = nameIdx != -1 ? cursor.getString(nameIdx) : "";
                        if (num != null && !num.trim().isEmpty()) {
                            docs.add(new ContactDocument(name, num));
                        }
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Full contacts fallback query error: " + e.getMessage());
            }
        }

        if (docs.isEmpty()) {
            return new RAGResult(null, 0.0, Collections.emptyList());
        }

        // Rank all documents using RAG similarity model
        List<ScoredContact> scoredList = new ArrayList<>();
        for (ContactDocument doc : docs) {
            double score = 0.0;
            StringBuilder rationale = new StringBuilder();

            // 1. Exact full normalized match
            if (doc.cleanName.equals(cleanQuery)) {
                score += 1.50;
                rationale.append("ExactNameMatch(+1.5); ");
            } else {
                // 2. Token Jaccard overlap
                double jaccard = computeTokenJaccard(queryTokens, doc.tokens);
                score += jaccard * 0.45;
                if (jaccard > 0) rationale.append(String.format(Locale.US, "TokenJaccard(%.2f); ", jaccard));

                // 3. All query tokens contained in contact tokens
                boolean allContained = true;
                for (String qTok : queryTokens) {
                    if (!doc.tokens.contains(qTok)) {
                        allContained = false;
                        break;
                    }
                }
                if (allContained && !queryTokens.isEmpty()) {
                    score += 0.40;
                    rationale.append("AllQueryTokensPresent(+0.40); ");
                }

                // 4. Character Trigram Cosine
                double trigramCosine = computeTrigramCosine(queryTrigrams, doc.trigrams);
                score += trigramCosine * 0.35;
                if (trigramCosine > 0.3) rationale.append(String.format(Locale.US, "TrigramSim(%.2f); ", trigramCosine));

                // 5. Lexical prefix / substring match
                if (doc.cleanName.startsWith(cleanQuery)) {
                    score += 0.25;
                    rationale.append("PrefixMatch(+0.25); ");
                } else if (doc.cleanName.contains(cleanQuery)) {
                    score += 0.15;
                    rationale.append("SubstringMatch(+0.15); ");
                }

                // 6. Semantic Role & Relationship Reranking (Critical)
                if (doc.hasRelativeMarker && !qWantsRelative) {
                    // Penalty: User asked for "Mithil" or "Mithil BIT", contact is "Mithil Amma"!
                    score -= 0.65;
                    rationale.append("UnrequestedRelativePenalty(-0.65); ");
                } else if (doc.hasRelativeMarker && qWantsRelative) {
                    // Boost: User explicitly asked for "Mithil Amma"
                    score += 0.60;
                    rationale.append("RequestedRelativeMatch(+0.60); ");
                } else if (!doc.hasRelativeMarker && !qWantsRelative) {
                    // Direct person match boost
                    score += 0.20;
                    rationale.append("DirectPersonBoost(+0.20); ");
                }

                // 7. Affiliation tag bonus (e.g. Mithil BIT, Kalif AIML)
                if (doc.hasAffiliationMarker && !doc.hasRelativeMarker) {
                    score += 0.15;
                    rationale.append("AffiliationBonus(+0.15); ");
                }
            }

            scoredList.add(new ScoredContact(doc, score, rationale.toString()));
        }

        Collections.sort(scoredList);

        // Logging top 3 for transparency
        Log.d(TAG, "RAG Retrieval results for query: '" + query + "'");
        for (int i = 0; i < Math.min(3, scoredList.size()); i++) {
            ScoredContact sc = scoredList.get(i);
            Log.d(TAG, String.format(Locale.US, "  #%d [%.3f] %s (%s) => %s",
                i + 1, sc.score, sc.doc.displayName, sc.doc.phoneNumber, sc.rationale));
        }

        if (!scoredList.isEmpty() && scoredList.get(0).score >= 0.30) {
            ScoredContact top = scoredList.get(0);
            return new RAGResult(top.doc, top.score, scoredList.subList(0, Math.min(5, scoredList.size())));
        }

        return new RAGResult(null, 0.0, scoredList);
    }
}
