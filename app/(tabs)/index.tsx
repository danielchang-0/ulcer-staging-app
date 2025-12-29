// index.tsx
// Expo Router screen: app/(tabs)/index.tsx
// REQUIREMENT: Location permission
// 1) Install: npx expo install expo-location
// 2) app.json: add ios.infoPlist.NSLocationWhenInUseUsageDescription + android.permissions (you already did)
// 3) Restart: npx expo start -c

import { FontAwesome } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/* ===========================
   Types & constants
=========================== */

type StageLabel =
  | "Stage I"
  | "Stage II"
  | "Stage III"
  | "Stage IV"
  | "Unstageable"
  | "DTPI";

const STAGES: StageLabel[] = [
  "Stage I",
  "Stage II",
  "Stage III",
  "Stage IV",
  "Unstageable",
  "DTPI",
];

/* ===========================
   Prototype probabilities (fixed)
   - Example: Stage IV is most likely
   - Unstageable = 0% (since it’s confidently staged)
   - Clicking stages does NOT change these numbers
=========================== */

const PROTO_PRED_STAGE: StageLabel = "Stage IV";

const PROTO_PROBS: Record<StageLabel, number> = {
  "Stage I": 0.01, // 1%
  "Stage II": 0.06, // 6%
  "Stage III": 0.18, // 18%
  "Stage IV": 0.73, // 73%
  Unstageable: 0.0, // 0%
  DTPI: 0.02, // 2%
};

function pct(p: number) {
  return Math.round(p * 100);
}

/* ===========================
   Confidence language (based on TOP probability)
=========================== */

function confidenceTierFromTop(topP: number) {
  if (topP >= 0.95) return { label: "Almost certain", hint: "≥95%" };
  if (topP >= 0.85) return { label: "Very likely", hint: "85–94%" };
  if (topP >= 0.7) return { label: "Most likely", hint: "70–84%" };
  if (topP >= 0.5) return { label: "Possible", hint: "50–69%" };
  return { label: "Uncertain", hint: "<50%" };
}

function likelihoodLabel(p: number) {
  if (p >= 0.85) return "Most likely";
  if (p >= 0.7) return "Likely";
  if (p >= 0.4) return "Possible";
  if (p >= 0.2) return "Unlikely";
  return "Highly unlikely";
}

/* ===========================
   Guidance
=========================== */

function getGuidance(stage: StageLabel) {
  const disclaimer =
    "Note: This is general guidance only. For accurate diagnosis and treatment, consult a doctor or clinic.";
  switch (stage) {
    case "Stage I":
      return {
        title: "Early pressure injury (mild)",
        bullets: [
          "Relieve pressure immediately (reposition, offload).",
          "Keep skin clean and dry; avoid friction/shear.",
          "Use moisture barrier cream if needed.",
          "Use pressure-relieving surfaces (foam cushion/mattress).",
          "Hydrate + increase protein intake if possible.",
          "Monitor daily for worsening.",
          disclaimer,
        ],
        urgency: "Low–Moderate",
      };
    case "Stage II":
      return {
        title: "Partial-thickness skin loss",
        bullets: [
          "Protect with an appropriate dressing.",
          "Reduce pressure and friction.",
          "Clean gently with saline or mild cleanser.",
          "Control moisture exposure (sweat/urine/stool).",
          "Nutrition support (protein, vitamin C, zinc).",
          "Seek care if worsening, pain, odor, or drainage increases.",
          disclaimer,
        ],
        urgency: "Moderate",
      };
    case "Stage III":
      return {
        title: "Full-thickness skin loss",
        bullets: [
          "Medical evaluation is strongly recommended.",
          "Strict pressure offloading needed.",
          "Monitor for infection (fever, odor, pus, spreading redness).",
          "Don’t delay—wound depth may progress quickly.",
          disclaimer,
        ],
        urgency: "High",
      };
    case "Stage IV":
      return {
        title: "Severe deep wound",
        bullets: [
          "Urgent medical care recommended.",
          "High infection risk—avoid aggressive self-treatment.",
          "Protect the area and offload pressure immediately.",
          disclaimer,
        ],
        urgency: "Very High",
      };
    case "Unstageable":
      return {
        title: "Depth cannot be determined",
        bullets: [
          "Tissue may conceal severity.",
          "Professional wound assessment recommended.",
          "Do not remove tissue at home (bleeding/infection risk).",
          disclaimer,
        ],
        urgency: "High",
      };
    case "DTPI":
      return {
        title: "Deep tissue pressure injury",
        bullets: [
          "Can worsen rapidly—seek evaluation soon.",
          "Offload pressure immediately; monitor for darkening/blistering.",
          "If skin turns purple/black or pain increases, get urgent care.",
          disclaimer,
        ],
        urgency: "High",
      };
  }
}

/* ===========================
   Accent colors
=========================== */

function getStageAccent(stage: StageLabel) {
  switch (stage) {
    case "Stage I":
      return { border: "#4ADE80", glow: "rgba(74,222,128,0.25)" };
    case "Stage II":
      return { border: "#60A5FA", glow: "rgba(96,165,250,0.25)" };
    case "Stage III":
      return { border: "#FBBF24", glow: "rgba(251,191,36,0.25)" };
    case "Stage IV":
      return { border: "#FB7185", glow: "rgba(251,113,133,0.25)" };
    case "Unstageable":
      return { border: "#A78BFA", glow: "rgba(167,139,250,0.25)" };
    case "DTPI":
      return { border: "#22D3EE", glow: "rgba(34,211,238,0.25)" };
  }
}

/* ===========================
   Find care near you (OSM)
=========================== */

type CareResult = {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lon: number;
  distanceMiles?: number;
};

function toMiles(meters: number) {
  return meters / 1609.344;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function openDirections(lat: number, lon: number, label?: string) {
  const encodedLabel = encodeURIComponent(label ?? "Care");
  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${lat},${lon}&q=${encodedLabel}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
  Linking.openURL(url);
}

function openUrl(url: string) {
  Linking.openURL(url);
}

function openEmail(email: string) {
  const subject = encodeURIComponent("WoundWise feedback");
  const body = encodeURIComponent("Hi! I have feedback about the app:\n\n");
  Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
}

async function geocodeOSM(query: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    query
  )}&limit=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": "woundwise-demo/1.0 (school project)" },
  });

  const data = (await res.json()) as any[];
  if (!data?.length) return null;

  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name as string,
  };
}

async function reverseGeocodeOSM(lat: number, lon: number) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "woundwise-demo/1.0 (school project)" },
    });
    const data = await res.json();
    return (data?.display_name as string) || "Current location";
  } catch {
    return "Current location";
  }
}

async function searchNearbyCareOSM(lat: number, lon: number) {
  const radius = 10000; // 10km

  const overpassQuery = `
[out:json][timeout:25];
(
  node(around:${radius},${lat},${lon})[amenity=hospital];
  way(around:${radius},${lat},${lon})[amenity=hospital];
  relation(around:${radius},${lat},${lon})[amenity=hospital];

  node(around:${radius},${lat},${lon})[amenity=clinic];
  way(around:${radius},${lat},${lon})[amenity=clinic];
  relation(around:${radius},${lat},${lon})[amenity=clinic];

  node(around:${radius},${lat},${lon})[healthcare=clinic];
  way(around:${radius},${lat},${lon})[healthcare=clinic];
  relation(around:${radius},${lat},${lon})[healthcare=clinic];
);
out center tags 25;
`;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(overpassQuery)}`,
  });

  const json = await res.json();
  const elements = (json?.elements ?? []) as any[];

  const results: CareResult[] = elements
    .map((el) => {
      const tags = el.tags ?? {};
      const name =
        tags.name ||
        tags["name:en"] ||
        (tags.amenity === "hospital" ? "Hospital" : "Clinic");

      const centerLat = el.lat ?? el.center?.lat;
      const centerLon = el.lon ?? el.center?.lon;
      if (typeof centerLat !== "number" || typeof centerLon !== "number") return null;

      const distM = haversineMeters(lat, lon, centerLat, centerLon);

      const addrParts = [
        tags["addr:housenumber"],
        tags["addr:street"],
        tags["addr:city"],
        tags["addr:state"],
        tags["addr:postcode"],
      ].filter(Boolean);

      return {
        id: `${el.type}-${el.id}`,
        name,
        address: addrParts.length ? addrParts.join(" ") : undefined,
        lat: centerLat,
        lon: centerLon,
        distanceMiles: toMiles(distM),
      } as CareResult;
    })
    .filter(Boolean) as CareResult[];

  results.sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999));
  return results.slice(0, 8);
}

/* ===========================
   Footer modal content
=========================== */

type FooterModalKey = "none" | "disclaimer" | "emergency" | "about" | "how";

function FooterModalBody({ which }: { which: Exclude<FooterModalKey, "none"> }) {
  if (which === "disclaimer") {
    return (
      <>
        <Text style={styles.modalTitle}>Medical Disclaimer</Text>
        <Text style={styles.modalText}>
          This app provides educational, general information and is not a medical device. It does not
          diagnose, treat, cure, or prevent any condition.
        </Text>
        <Text style={styles.modalText}>
          Always confirm staging and treatment with a qualified clinician (wound clinic, nurse, or doctor),
          especially for Stage III/IV, Unstageable, or DTPI.
        </Text>
      </>
    );
  }

  if (which === "emergency") {
    return (
      <>
        <Text style={styles.modalTitle}>When to get urgent help</Text>
        <Text style={styles.modalText}>
          Seek urgent care (or call emergency services) if any of these occur:
        </Text>
        <View style={styles.modalList}>
          <Text style={styles.modalItem}>• Fever or chills</Text>
          <Text style={styles.modalItem}>• Rapidly worsening wound, spreading redness, or warmth</Text>
          <Text style={styles.modalItem}>• Pus/drainage, bad odor, or severe increasing pain</Text>
          <Text style={styles.modalItem}>• Confusion, fainting, or trouble breathing</Text>
          <Text style={styles.modalItem}>• Black/purple skin changes that expand quickly</Text>
        </View>
        <Text style={styles.modalText}>
          If you’re unsure, it’s safer to be evaluated promptly.
        </Text>
      </>
    );
  }

  if (which === "about") {
    return (
      <>
        <Text style={styles.modalTitle}>What this app does</Text>
        <Text style={styles.modalText}>
          WoundWise helps users understand pressure-injury staging by showing:
        </Text>
        <View style={styles.modalList}>
          <Text style={styles.modalItem}>• The most likely stage (prototype demo)</Text>
          <Text style={styles.modalItem}>• A simple confidence label</Text>
          <Text style={styles.modalItem}>• Next-step guidance + safety reminders</Text>
          <Text style={styles.modalItem}>• Nearby care (using your location if you allow it)</Text>
        </View>
        <Text style={styles.modalText}>
          It’s designed for learning and awareness—not for final diagnosis.
        </Text>
      </>
    );
  }

  return (
    <>
      <Text style={styles.modalTitle}>How staging works (simple)</Text>
      <Text style={styles.modalText}>
        Pressure injuries are staged by how deep the damage goes:
      </Text>
      <View style={styles.modalList}>
        <Text style={styles.modalItem}>• Stage I: skin intact but red (may not blanch)</Text>
        <Text style={styles.modalItem}>• Stage II: partial skin loss (blister/open sore)</Text>
        <Text style={styles.modalItem}>• Stage III: full-thickness loss (deeper crater)</Text>
        <Text style={styles.modalItem}>• Stage IV: very deep (may expose muscle/tendon/bone)</Text>
        <Text style={styles.modalItem}>• Unstageable: depth can’t be seen due to coverage</Text>
        <Text style={styles.modalItem}>• DTPI: deep damage under skin (purple/maroon area)</Text>
      </View>
      <Text style={styles.modalText}>
        The percentages are the model’s estimated likelihoods—not a guarantee. Lighting, angle,
        and photo quality can affect results.
      </Text>
    </>
  );
}

/* ===========================
   App component
=========================== */

export default function Index() {
  // Photo placeholder (wire later)
  const [photoUri] = useState<string | null>(null);

  // Which stage user clicked (for viewing + accent color)
  const [selectedStage, setSelectedStage] = useState<StageLabel>(PROTO_PRED_STAGE);

  // UI
  const [infoOpen, setInfoOpen] = useState(false);
  const [showAllStages, setShowAllStages] = useState(false);

  // Footer modals
  const [footerModal, setFooterModal] = useState<FooterModalKey>("none");

  // Location + care
  const [locationStatus, setLocationStatus] = useState<
    "unknown" | "granted" | "denied" | "error"
  >("unknown");
  const [originLabel, setOriginLabel] = useState("");
  const [careResults, setCareResults] = useState<CareResult[]>([]);
  const [careLoading, setCareLoading] = useState(false);
  const [careError, setCareError] = useState("");

  // Manual input fallback (always available)
  const [locationQuery, setLocationQuery] = useState("");

  // Fixed prototype probabilities
  const stageProbs = useMemo(() => PROTO_PROBS, []);
  const ranked = useMemo(() => {
    return [...STAGES].sort((a, b) => stageProbs[b] - stageProbs[a]);
  }, [stageProbs]);

  const topStage = ranked[0];
  const topP = stageProbs[topStage];
  const tier = useMemo(() => confidenceTierFromTop(topP), [topP]);

  // ✅ YOU ASKED: COLOR CHANGES WHEN CLICKING STAGES
  const accent = useMemo(() => getStageAccent(selectedStage), [selectedStage]);

  // Guidance stays based on MOST LIKELY stage (safer)
  const guidance = useMemo(() => getGuidance(topStage), [topStage]);

  async function runCareSearchFromCoords(lat: number, lon: number) {
    try {
      setCareLoading(true);
      setCareError("");
      setCareResults([]);
      const label = await reverseGeocodeOSM(lat, lon);
      setOriginLabel(label);

      const results = await searchNearbyCareOSM(lat, lon);
      if (!results.length) {
        setCareError("No nearby hospitals/clinics found within ~10km.");
        return;
      }
      setCareResults(results);
    } catch (e: any) {
      setCareError(e?.message ?? "Care search failed. Try again.");
    } finally {
      setCareLoading(false);
    }
  }

  async function requestAndUseLocation() {
    try {
      setCareError("");
      setOriginLabel("");
      setCareResults([]);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationStatus("denied");
        setCareError("Location permission denied. You can still enter a ZIP code/address below.");
        return;
      }

      setLocationStatus("granted");
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      await runCareSearchFromCoords(pos.coords.latitude, pos.coords.longitude);
    } catch (e: any) {
      setLocationStatus("error");
      setCareError(e?.message ?? "Could not access location.");
    }
  }

  // Ask automatically on first load
  useEffect(() => {
    requestAndUseLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
      <Text style={styles.header}>WoundWise</Text>
      <Text style={styles.subheader}>
        Prototype demo • fixed probabilities • location-based care search
      </Text>

      {/* Top row */}
      <View style={styles.topRow}>
        {/* Photo preview */}
        <View style={styles.previewCard}>
          <Text style={styles.cardLabel}>Photo</Text>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.previewImage} />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Text style={styles.placeholderText}>No image yet</Text>
              <Text style={styles.placeholderSubtext}>(Prototype UI)</Text>
            </View>
          )}
        </View>

        {/* Prediction summary */}
        <View style={[styles.stageCard, { borderColor: accent.border, shadowColor: accent.glow }]}>
          <View style={styles.stageHeaderRow}>
            <Text style={styles.cardLabel}>Prediction</Text>
            <Pressable onPress={() => setInfoOpen(true)} style={styles.infoBtn}>
              <Text style={styles.infoBtnText}>i</Text>
            </Pressable>
          </View>

          <Text style={styles.mostLikelyText}>
            {tier.label} {topStage} ({pct(topP)}%)
          </Text>

          <Text style={styles.stageText}>
            Viewing: {selectedStage} ({pct(stageProbs[selectedStage])}%)
          </Text>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, { borderColor: accent.border }]}>
              <Text style={styles.badgeText}>Urgency: {guidance.urgency}</Text>
            </View>
            <View style={styles.badgeSoft}>
              <Text style={styles.badgeSoftText}>Tier: {tier.hint}</Text>
            </View>
          </View>

          <View style={styles.barOuter}>
            <View
              style={[
                styles.barInner,
                {
                  width: `${Math.min(100, Math.max(0, topP * 100))}%`,
                  backgroundColor: accent.border,
                },
              ]}
            />
          </View>

          <Text style={styles.disclaimer}>
            Not medical advice. Confirm staging with a trained clinician.
          </Text>
        </View>
      </View>

      {/* Stage likelihoods (collapsed by default) */}
      <View style={styles.tabsCard}>
        <View style={styles.stageLikelyHeader}>
          <Text style={styles.cardLabel}>Stage likelihoods</Text>

          <Pressable
            onPress={() => setShowAllStages((v) => !v)}
            style={styles.dropdownBtn}
            hitSlop={10}
          >
            <Text style={styles.dropdownBtnText}>{showAllStages ? "Hide ▲" : "Show ▼"}</Text>
          </Pressable>
        </View>

        {/* Always show top stage */}
        <View style={styles.topOnlyRow}>
          <Text style={styles.topOnlyLabel}>Most likely:</Text>
          <Text style={styles.topOnlyValue}>
            {topStage} ({pct(topP)}%)
          </Text>
        </View>

        {showAllStages && (
          <View style={styles.tabsWrap}>
            {STAGES.map((s) => {
              const p = stageProbs[s] ?? 0;
              const label = likelihoodLabel(p);
              const isSelected = s === selectedStage;
              const isTop = s === topStage;

              return (
                <Pressable
                  key={s}
                  onPress={() => setSelectedStage(s)}
                  style={[
                    styles.stageTab,
                    isSelected && { borderColor: accent.border },
                    isTop && styles.topTabGlow,
                  ]}
                >
                  <View style={styles.tabRow}>
                    <Text style={styles.tabStage}>{s}</Text>
                    <Text style={styles.tabPct}>{pct(p)}%</Text>
                  </View>
                  <Text style={[styles.tabLabel, isTop && { color: "rgba(234,240,255,0.95)" }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.devHint}>
          Prototype note: probabilities are fixed (clicking a stage shows its %; it doesn’t rewrite the model output).
        </Text>
      </View>

      {/* Guidance (based on MOST LIKELY stage) */}
      <View style={[styles.guidanceCard, { borderColor: accent.border, shadowColor: accent.glow }]}>
        <Text style={styles.cardLabel}>What to do (based on {topStage})</Text>
        <Text style={styles.guidanceTitle}>{guidance.title}</Text>

        <View style={styles.bullets}>
          {guidance.bullets.map((b) => (
            <View key={b} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{b}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Find care near you */}
      <View style={styles.careCard}>
        <Text style={styles.cardLabel}>Find care near you</Text>

        <Text style={styles.careText}>
          {locationStatus === "granted"
            ? "Using your location (you can still search another ZIP/address below)."
            : "Allow location to auto-find nearby care, or enter a ZIP/address below."}
        </Text>

        <View style={styles.careTopButtonsRow}>
          <Pressable style={styles.secondaryBtn} onPress={requestAndUseLocation}>
            <Text style={styles.secondaryBtnText}>Use my location</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => {
              setCareResults([]);
              setCareError("");
              setOriginLabel("");
              setLocationQuery("");
            }}
          >
            <Text style={styles.secondaryBtnText}>Clear results</Text>
          </Pressable>
        </View>

        <TextInput
          value={locationQuery}
          onChangeText={setLocationQuery}
          placeholder="ZIP code or address (optional)"
          placeholderTextColor="rgba(234,240,255,0.35)"
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
        />

        <Pressable
          style={[styles.findBtn, { borderColor: accent.border }]}
          onPress={async () => {
            const q = locationQuery.trim();
            if (!q) {
              setCareError("Type a ZIP code or address first (or tap “Use my location”).");
              return;
            }

            try {
              setCareLoading(true);
              setCareError("");
              setCareResults([]);
              setOriginLabel("");

              const geo = await geocodeOSM(q);
              if (!geo) {
                setCareError("Couldn’t find that location. Try a full address or ZIP + city.");
                return;
              }

              setOriginLabel(geo.displayName);
              const results = await searchNearbyCareOSM(geo.lat, geo.lon);

              if (!results.length) {
                setCareError("No nearby hospitals/clinics found within ~10km.");
                return;
              }

              setCareResults(results);
            } catch (e: any) {
              setCareError(e?.message ?? "Search failed. Try again.");
            } finally {
              setCareLoading(false);
            }
          }}
        >
          <Text style={styles.findBtnText}>
            {careLoading ? "Searching..." : "Search this ZIP/address"}
          </Text>
        </Pressable>

        {careLoading && <Text style={styles.careHint}>Searching…</Text>}
        {!!careError && <Text style={styles.careError}>{careError}</Text>}
        {!!originLabel && !careLoading && <Text style={styles.careHint}>Near: {originLabel}</Text>}

        {careResults.map((r) => (
          <View key={r.id} style={styles.resultCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultName}>{r.name}</Text>
              {!!r.address && <Text style={styles.resultMeta}>{r.address}</Text>}
              <Text style={styles.resultMeta}>
                {r.distanceMiles != null ? `${r.distanceMiles.toFixed(1)} mi (approx)` : "Distance unknown"}
              </Text>
            </View>

            <Pressable
              style={styles.directionsBtn}
              onPress={() => openDirections(r.lat, r.lon, r.name)}
            >
              <Text style={styles.directionsBtnText}>Directions</Text>
            </Pressable>
          </View>
        ))}
      </View>

      {/* ✅ FOOTER */}
      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Footer</Text>

        <Text style={styles.footerSectionTitle}>Trust & safety</Text>
        <View style={styles.footerGrid}>
          <Pressable style={styles.footerPill} onPress={() => setFooterModal("disclaimer")}>
            <Text style={styles.footerPillText}>Medical disclaimer</Text>
          </Pressable>
          <Pressable style={styles.footerPill} onPress={() => setFooterModal("emergency")}>
            <Text style={styles.footerPillText}>When to get urgent help</Text>
          </Pressable>
        </View>

        <Text style={styles.footerMiniNote}>
          If severe pain, fever, spreading redness, rapid worsening, or you feel unsafe — seek urgent care.
        </Text>

        <Text style={[styles.footerSectionTitle, { marginTop: 14 }]}>Learn</Text>
        <View style={styles.footerGrid}>
          <Pressable style={styles.footerPill} onPress={() => setFooterModal("about")}>
            <Text style={styles.footerPillText}>What this app does</Text>
          </Pressable>
          <Pressable style={styles.footerPill} onPress={() => setFooterModal("how")}>
            <Text style={styles.footerPillText}>How staging works</Text>
          </Pressable>
        </View>

        <View style={styles.footerMetaRow}>
          <Text style={styles.footerMetaText}>v1 • Jan 2026</Text>
          <Pressable onPress={() => openEmail("rxliu028@gmail.com")} style={styles.footerEmailBtn}>
            <Text style={styles.footerEmailText}>rxliu028@gmail.com</Text>
          </Pressable>
        </View>

        <Text style={[styles.footerSectionTitle, { marginTop: 14 }]}>Team Instagram</Text>
        <View style={styles.footerLinks}>
          <Pressable style={styles.footerLink} onPress={() => openUrl("https://www.instagram.com/improperly28/")}>
            <FontAwesome name="instagram" size={18} color="rgba(234,240,255,0.85)" />
            <Text style={styles.footerLinkText}>Runxi Liu</Text>
          </Pressable>

          <Pressable style={styles.footerLink} onPress={() => openUrl("https://www.instagram.com/danarchy.jpg/")}>
            <FontAwesome name="instagram" size={18} color="rgba(234,240,255,0.85)" />
            <Text style={styles.footerLinkText}>Daniel Chang</Text>
          </Pressable>

          <Pressable style={styles.footerLink} onPress={() => openUrl("https://www.instagram.com/gmcamei/")}>
            <FontAwesome name="instagram" size={18} color="rgba(234,240,255,0.85)" />
            <Text style={styles.footerLinkText}>Kimi Wang</Text>
          </Pressable>

          <View style={styles.footerDivider} />
          <Text style={styles.footerSubtitle}>Helpers</Text>

          <Pressable style={styles.footerLink} onPress={() => openUrl("https://www.instagram.com/liuqianhn/")}>
            <FontAwesome name="instagram" size={18} color="rgba(234,240,255,0.70)" />
            <Text style={styles.footerLinkText}>Chris Liu</Text>
          </Pressable>

          <Pressable style={styles.footerLink} onPress={() => openUrl("https://www.instagram.com/david2015cedar/")}>
            <FontAwesome name="instagram" size={18} color="rgba(234,240,255,0.70)" />
            <Text style={styles.footerLinkText}>David Wang</Text>
          </Pressable>

          <Pressable style={styles.footerLink} onPress={() => openUrl("https://www.instagram.com/qiminlang/")}>
            <FontAwesome name="instagram" size={18} color="rgba(234,240,255,0.70)" />
            <Text style={styles.footerLinkText}>Qimin Lang</Text>
          </Pressable>
        </View>

        <Text style={styles.footerNote}>© {new Date().getFullYear()} • Educational demo</Text>
      </View>

      {/* Info modal */}
      <Modal
        visible={infoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confidence labels</Text>
            <Text style={styles.modalText}>
              We translate the top prediction probability into wording:
            </Text>

            <View style={styles.modalList}>
              <Text style={styles.modalItem}>• Almost certain: ≥ 95%</Text>
              <Text style={styles.modalItem}>• Very likely: 85–94%</Text>
              <Text style={styles.modalItem}>• Most likely: 70–84%</Text>
              <Text style={styles.modalItem}>• Possible: 50–69%</Text>
              <Text style={styles.modalItem}>• Uncertain: &lt; 50%</Text>
            </View>

            <Pressable style={styles.modalClose} onPress={() => setInfoOpen(false)}>
              <Text style={styles.modalCloseText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Footer modals */}
      <Modal
        visible={footerModal !== "none"}
        transparent
        animationType="fade"
        onRequestClose={() => setFooterModal("none")}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {footerModal !== "none" && <FooterModalBody which={footerModal} />}
            <Pressable style={styles.modalClose} onPress={() => setFooterModal("none")}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

/* ===========================
   Styles
=========================== */

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    paddingBottom: 220,
    backgroundColor: "#0B1020",
    flexGrow: 1,
  },

  header: { fontSize: 24, fontWeight: "800", color: "#EAF0FF", marginBottom: 4 },
  subheader: { fontSize: 13, color: "rgba(234,240,255,0.70)", marginBottom: 14 },

  topRow: { flexDirection: "row", gap: 12, alignItems: "stretch" },

  previewCard: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#121A33",
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  previewImage: {
    width: "100%",
    height: 120,
    borderRadius: 12,
    marginTop: 10,
    backgroundColor: "#0B1020",
  },
  previewPlaceholder: {
    width: "100%",
    height: 120,
    borderRadius: 12,
    marginTop: 10,
    backgroundColor: "#0F1730",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  placeholderText: { color: "rgba(234,240,255,0.85)", fontWeight: "800", marginBottom: 4 },
  placeholderSubtext: { color: "rgba(234,240,255,0.55)", fontSize: 12, textAlign: "center" },

  stageCard: {
    flex: 1.2,
    borderRadius: 16,
    backgroundColor: "#121A33",
    padding: 12,
    borderWidth: 1.5,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  stageHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  infoBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  infoBtnText: { color: "rgba(234,240,255,0.85)", fontWeight: "900", lineHeight: Platform.OS === "android" ? 18 : 16 },

  cardLabel: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "rgba(234,240,255,0.65)",
  },

  mostLikelyText: { marginTop: 10, fontSize: 15, fontWeight: "900", color: "#EAF0FF" },
  stageText: { marginTop: 6, fontSize: 13, fontWeight: "800", color: "rgba(234,240,255,0.80)" },

  badgeRow: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  badgeText: { color: "rgba(234,240,255,0.85)", fontSize: 12, fontWeight: "800" },
  badgeSoft: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  badgeSoftText: { color: "rgba(234,240,255,0.70)", fontSize: 12, fontWeight: "700" },

  barOuter: {
    marginTop: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  barInner: { height: "100%", borderRadius: 999 },

  disclaimer: { marginTop: 10, fontSize: 11, color: "rgba(234,240,255,0.55)", lineHeight: 16 },

  tabsCard: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: "#121A33",
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  stageLikelyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dropdownBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  dropdownBtnText: { color: "rgba(234,240,255,0.85)", fontWeight: "900", fontSize: 12 },

  topOnlyRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  topOnlyLabel: { color: "rgba(234,240,255,0.70)", fontWeight: "800", fontSize: 12 },
  topOnlyValue: { color: "rgba(234,240,255,0.92)", fontWeight: "900", fontSize: 12 },

  tabsWrap: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stageTab: {
    width: "48%",
    borderRadius: 14,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  topTabGlow: { backgroundColor: "rgba(255,255,255,0.05)" },

  tabRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 6 },
  tabStage: { color: "rgba(234,240,255,0.90)", fontWeight: "800", fontSize: 12 },
  tabPct: { color: "rgba(234,240,255,0.70)", fontWeight: "800", fontSize: 12 },
  tabLabel: { color: "rgba(234,240,255,0.70)", fontSize: 12, fontWeight: "700" },

  devHint: { marginTop: 10, color: "rgba(234,240,255,0.55)", fontSize: 12, lineHeight: 18 },

  guidanceCard: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: "#121A33",
    padding: 12,
    borderWidth: 1.5,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  guidanceTitle: { marginTop: 8, fontSize: 16, fontWeight: "900", color: "#EAF0FF", marginBottom: 8 },
  bullets: { gap: 8 },
  bulletRow: { flexDirection: "row", gap: 8 },
  bulletDot: { color: "rgba(234,240,255,0.85)", fontSize: 16, lineHeight: 20 },
  bulletText: { flex: 1, color: "rgba(234,240,255,0.78)", fontSize: 13, lineHeight: 18 },

  careCard: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: "#121A33",
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  careText: { marginTop: 8, color: "rgba(234,240,255,0.75)", fontSize: 13, lineHeight: 18, marginBottom: 10 },
  careTopButtonsRow: { flexDirection: "row", gap: 10, marginBottom: 10 },

  secondaryBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  secondaryBtnText: { color: "rgba(234,240,255,0.88)", fontWeight: "900", fontSize: 12 },

  input: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    color: "rgba(234,240,255,0.90)",
    backgroundColor: "rgba(0,0,0,0.15)",
    marginBottom: 10,
  },
  findBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  findBtnText: { color: "rgba(234,240,255,0.92)", fontWeight: "900" },
  careHint: { marginTop: 8, color: "rgba(234,240,255,0.55)", fontSize: 12 },
  careError: { marginTop: 8, color: "#FB7185", fontWeight: "700" },

  resultCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resultName: { color: "rgba(234,240,255,0.92)", fontWeight: "900" },
  resultMeta: { color: "rgba(234,240,255,0.70)", marginTop: 4, fontSize: 12 },
  directionsBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  directionsBtnText: { color: "rgba(234,240,255,0.92)", fontWeight: "900", fontSize: 12 },

  footer: { marginTop: 22, paddingTop: 16, borderTopWidth: 2, borderTopColor: "rgba(255,255,255,0.20)" },
  footerLabel: { color: "rgba(234,240,255,0.50)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  footerSectionTitle: { color: "rgba(234,240,255,0.85)", fontWeight: "900", fontSize: 12, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 },
  footerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  footerPill: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.03)" },
  footerPillText: { color: "rgba(234,240,255,0.88)", fontWeight: "800", fontSize: 12 },
  footerMiniNote: { marginTop: 10, color: "rgba(234,240,255,0.55)", fontSize: 12, lineHeight: 18 },
  footerMetaRow: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  footerMetaText: { color: "rgba(234,240,255,0.55)", fontSize: 12, fontWeight: "700" },
  footerEmailBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", backgroundColor: "rgba(255,255,255,0.03)" },
  footerEmailText: { color: "rgba(234,240,255,0.90)", fontWeight: "900", fontSize: 12 },

  footerLinks: { gap: 10, marginTop: 8 },
  footerLink: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.03)" },
  footerLinkText: { color: "rgba(234,240,255,0.88)", fontWeight: "800", fontSize: 13 },
  footerSubtitle: { color: "rgba(234,240,255,0.60)", fontWeight: "800", fontSize: 12, marginTop: 8, marginBottom: 6 },
  footerDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginVertical: 6 },
  footerNote: { marginTop: 10, color: "rgba(234,240,255,0.45)", fontSize: 11 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 18, backgroundColor: "#111A34", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", padding: 14 },
  modalTitle: { color: "#EAF0FF", fontWeight: "900", fontSize: 16, marginBottom: 8 },
  modalText: { color: "rgba(234,240,255,0.75)", fontSize: 13, lineHeight: 18 },
  modalList: { marginTop: 10, marginBottom: 10, gap: 6 },
  modalItem: { color: "rgba(234,240,255,0.85)", fontSize: 13, fontWeight: "700" },
  modalClose: { marginTop: 12, borderRadius: 12, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  modalCloseText: { color: "#EAF0FF", fontWeight: "900" },
});