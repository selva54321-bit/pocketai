package com.pocketai.retrieval;

import org.junit.Test;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.*;

public class ContactRAGRetrieverTest {

    private final List<ContactRAGRetriever.ContactDocument> sampleCorpus = Arrays.asList(
        new ContactRAGRetriever.ContactDocument("Mithil BIT", "+919894547825"),
        new ContactRAGRetriever.ContactDocument("Mithil Amma", "9894367825"),
        new ContactRAGRetriever.ContactDocument("Kalif AIML", "9150225755"),
        new ContactRAGRetriever.ContactDocument("Kalif Amma", "9894665755"),
        new ContactRAGRetriever.ContactDocument("Suguthan Mom", "+916374219319"),
        new ContactRAGRetriever.ContactDocument("Keerthan Appa", "+919842971213"),
        new ContactRAGRetriever.ContactDocument("Keerthan \uD83D\uDE04\uD83D\uDE04", "+916381236923")
    );

    @Test
    public void testMithilBitQueryReturnsMithilBit() {
        List<ContactRAGRetriever.ScoredContact> results = ContactRAGRetriever.rankCandidates("mithil bit", sampleCorpus);
        assertFalse(results.isEmpty());
        ContactRAGRetriever.ScoredContact top = results.get(0);
        assertEquals("Mithil BIT", top.doc.displayName);
        assertEquals("+919894547825", top.doc.phoneNumber);
        assertTrue("Top score should be significantly higher than #2", top.score > 1.0);
    }

    @Test
    public void testMithilSingleWordQueryPrioritizesMithilBitOverAmma() {
        List<ContactRAGRetriever.ScoredContact> results = ContactRAGRetriever.rankCandidates("mithil", sampleCorpus);
        assertFalse(results.isEmpty());
        ContactRAGRetriever.ScoredContact top = results.get(0);
        assertEquals("When user says 'Mithil', it MUST choose Mithil BIT instead of Mithil Amma",
            "Mithil BIT", top.doc.displayName);
        assertEquals("+919894547825", top.doc.phoneNumber);
    }

    @Test
    public void testMithilAmmaExplicitQueryReturnsMithilAmma() {
        List<ContactRAGRetriever.ScoredContact> results = ContactRAGRetriever.rankCandidates("mithil amma", sampleCorpus);
        assertFalse(results.isEmpty());
        ContactRAGRetriever.ScoredContact top = results.get(0);
        assertEquals("Mithil Amma", top.doc.displayName);
        assertEquals("9894367825", top.doc.phoneNumber);
    }

    @Test
    public void testKalifQueryPrioritizesKalifAimlOverAmma() {
        List<ContactRAGRetriever.ScoredContact> results = ContactRAGRetriever.rankCandidates("kalif", sampleCorpus);
        assertFalse(results.isEmpty());
        ContactRAGRetriever.ScoredContact top = results.get(0);
        assertEquals("Kalif AIML", top.doc.displayName);
        assertEquals("9150225755", top.doc.phoneNumber);
    }

    @Test
    public void testKeerthanQueryPrioritizesKeerthanDirectOverAppa() {
        List<ContactRAGRetriever.ScoredContact> results = ContactRAGRetriever.rankCandidates("keerthan", sampleCorpus);
        assertFalse(results.isEmpty());
        ContactRAGRetriever.ScoredContact top = results.get(0);
        assertEquals("Keerthan \uD83D\uDE04\uD83D\uDE04", top.doc.displayName);
        assertEquals("+916381236923", top.doc.phoneNumber);
    }
}
