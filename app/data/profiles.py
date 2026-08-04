"""Seed fixtures for the Wing Mode demo.

Sheshu is the account owner and Jason and Julia are the wings — the three people
running the demo. Sewon fills the third seat so the friend cap can be shown.

The Discover deck is five Springfield men, because the profile copy is funnier
when you already know the people. Their photos are real screenshots in
static/img/<id>/.

`label` on a photo is the short noun phrase used in Wing Badge copy — it is what
makes "Julia reacted to his couch photo" read like a sentence instead of
"photo 3". `caption` is the longer line drawn onto the placeholder image.
"""

import copy

# The owner's photos are deliberately in a bad order: the one genuinely good
# shot sits at index 3, buried behind a mirror selfie and a group photo. Both
# wings will move it to the front, which gives Profile Review an obvious payoff.
OWNER_PROFILE = {
    "id": "sheshu",
    "name": "Sheshu",
    "age": 28,
    "job": "MBA Consultant",
    "location": "NYC",
    "pronouns": "He/Him",
    "photos": [
        {"caption": "Mirror selfie, gym bathroom", "label": "mirror selfie"},
        {"caption": "I'm somewhere in this group photo", "label": "group photo"},
        {"caption": "My coffee. Riveting.", "label": "coffee photo"},
        {"caption": "Sunrise at the lookout", "label": "sunrise photo"},
        {"caption": "Pottery class, first attempt", "label": "pottery photo"},
        {"caption": "Me and Biscuit", "label": "dog photo"},
    ],
    "prompts": [
        # Intentionally weak — this is the prompt the wings will rewrite.
        {"question": "A life goal of mine",
        "answer": "Idk. Be happy I guess?"},
        {
            "question": "I go crazy for",
            "answer": "Someone with strong opinions about a sandwich.",
        },
        {
            "question": "The way to win me over is",
            "answer": "Send me the restaurant you've been saving for the right person. I'll book it.",
        },
    ],
}


DECK = [
    {
        "id": "homer",
        "name": "Homer",
        "age": 39,
        "job": "Safety Inspector, Sector 7-G",
        "location": "742 Evergreen Terrace",
        "matches_back": True,
        "photos": [
            {"caption": "Full length, since people keep asking", "label": "full-length photo"},
            {"caption": "Sector 7-G. That's my desk.", "label": "office photo"},
            {"caption": "Donuts. Any donut. All donuts.", "label": "donut photo"},
            {"caption": "Just another day at the plant", "label": "plant photo"},
            {"caption": "In the kitchen, allegedly cooking", "label": "kitchen photo"},
            {"caption": "Not my finest moment", "label": "crow photo"},
        ],
        "prompts": [
            {
                    "question": "I'm looking for",
                    "answer": "Honestly? I thought this app was for finding sandwiches.",
            },
            {
                "question": "Two truths and a lie",
                "answer": "I've been to space. I've been fired eleven times. I once ate 64 slices of cheese.",
            },
            {
                "question": "My simple pleasures",
                "answer": "Beer. Donuts. The exact moment the television turns on.",
            },
        ],
    },
    {
        "id": "moe",
        "name": "Moe",
        "age": 51,
        "job": "Owner, Moe's Tavern",
        "location": "Downtown Springfield",
        "matches_back": True,
        "photos": [
            {"caption": "Me. Unretouched.", "label": "portrait"},
            {"caption": "Behind the bar, where I live", "label": "bar photo"},
            {"caption": "The apron has seen things", "label": "apron photo"},
            {"caption": "Moe's. Come for the ambience.", "label": "tavern photo"},
            {"caption": "Making a point", "label": "close-up"},
            {"caption": "Tourist night. It's a whole thing.", "label": "tourist night photo"},
        ],
        "prompts": [
            {
                "question": "I'll fall for you if",
                "answer": "You laugh at one of my jokes. Just one. Nobody laughs at my jokes.",
            },
            {"question": "The key to my heart is", "answer": "Low expectations and a high tolerance."},
            {
                "question": "A shower thought I recently had",
                "answer": "What if the health inspector just... didn't come back?",
            },
        ],
    },
    {
        "id": "flanders",
        "name": "Ned",
        "age": 60,
        "job": "Owner, The Leftorium",
        "location": "744 Evergreen Terrace",
        "matches_back": False,
        "photos": [
            {"caption": "Out front, saying hi-diddly-ho", "label": "front garden photo"},
            {"caption": "The moustache and I", "label": "moustache photo"},
            {"caption": "Sunday best", "label": "Sunday best photo"},
            {"caption": "Waving at absolutely everyone", "label": "waving photo"},
            {"caption": "Leaning over the fence again", "label": "fence photo"},
            {"caption": "Choir practice", "label": "choir photo"},
        ],
        "prompts": [
            {
                "question": "My simple pleasures",
                "answer": "A fresh pot of coffee, a well-organized garage, and the good Lord's own sunshine.",
            },
            {"question": "I'll brag about you to my friends if", "answer": "You alphabetize anything at all."},
            {"question": "Typical Sunday", "answer": "Church, then church, then a little light church."},
        ],
    },
    {
        "id": "krusty",
        "name": "Krusty",
        "age": 55,
        "job": "Entertainer",
        "location": "Springfield",
        "matches_back": False,
        "photos": [
            {"caption": "Live, on stage", "label": "stage photo"},
            {"caption": "Craft services", "label": "eating photo"},
            {"caption": "Between takes", "label": "smoke break photo"},
            {"caption": "The face that sells the merch", "label": "logo photo"},
            {"caption": "Endorsement shoot. Don't ask what for.", "label": "endorsement photo"},
            {"caption": "The empire", "label": "restaurant photo"},
        ],
        "prompts": [
            {"question": "Give me travel tips for", "answer": "Anywhere without an extradition treaty."},
            {
                "question": "My greatest strength",
                "answer": "I can do a solid ninety minutes on almost no material.",
            },
            {"question": "Dating me is like", "answer": "A rerun. You've seen it. But it's on."},
        ],
    },
    {
        # The 😬 card. Every demo needs one profile where the reaction from the
        # room is instant and unanimous.
        "id": "cbg",
        "name": "Jeff",
        "age": 45,
        "job": "Owner, The Android's Dungeon",
        "location": "Springfield",
        "matches_back": False,
        "photos": [
            {"caption": "The Android's Dungeon", "label": "shop photo"},
            {"caption": "Opening night. Obviously.", "label": "cinema photo"},
            {"caption": "Reviewing something. Poorly.", "label": "review photo"},
            {"caption": "Sunday inventory", "label": "inventory photo"},
            {"caption": "Convention, day two", "label": "convention photo"},
            {"caption": "Convention, day three", "label": "cosplay photo"},
        ],
        "prompts": [
            {"question": "I geek out on", "answer": "Everything. Ranked. Alphabetized. With footnotes."},
            {
                "question": "The one thing I'd love to know about you",
                "answer": "Your position on the 1987 continuity reboot. This is not a small question.",
            },
            {
                "question": "Worst idea I've ever had",
                "answer": "Reviewing one of my own dates online. Worst. Decision. Ever.",
            },
        ],
    },
]


# The wings' own profiles. A friend "logs in as they usually do", which means
# they land on their own Hinge profile — and the join-by-code button lives in the
# top right of it. These only need to be substantial enough for that screen to
# feel like a real account rather than a stub.
FRIEND_PROFILES = [
    {
        "id": "jason",
        "name": "Jason",
        "age": 31,
        "job": "Grill Guy",
        "location": "Springfield",
        "photos": [
            {"caption": "The good jacket", "label": "jacket photo"},
            {"caption": "Saturday, no plans", "label": "saturday photo"},
            {"caption": "Record store, again", "label": "record store photo"},
        ],
        "prompts": [
            {"question": "My simple pleasures", "answer": "A long walk and an opinion nobody asked for."},
            {"question": "I'm looking for", "answer": "Nothing — I'm just here to help Sheshu."},
        ],
    },
    {
        "id": "julia",
        "name": "Julia",
        "age": 29,
        "job": "Copywriter",
        "location": "Springfield",
        "photos": [
            {"caption": "Golden hour, obviously", "label": "golden hour photo"},
            {"caption": "Sunday market", "label": "market photo"},
            {"caption": "The one my mum likes", "label": "portrait"},
        ],
        "prompts": [
            {"question": "My simple pleasures", "answer": "Rewriting other people's sentences."},
            {"question": "I'll fall for you if", "answer": "You text in full paragraphs."},
        ],
    },
    {
        # Third seat. Exists so the 3-friend cap can actually be demonstrated.
        "id": "sewon",
        "name": "Sewon",
        "age": 30,
        "job": "Researcher",
        "location": "Springfield",
        "photos": [
            {"caption": "Climbing gym, Tuesdays", "label": "climbing photo"},
            {"caption": "The good coffee place", "label": "coffee photo"},
            {"caption": "New haircut, new me", "label": "haircut photo"},
        ],
        "prompts": [
            {"question": "My simple pleasures", "answer": "Being right, quietly, about three weeks later."},
            {"question": "I'm looking for", "answer": "Nothing. I'm strictly here in an advisory capacity."},
        ],
    },
    {
        # For anyone from Hinge who wants to sit in on the session.
        "id": "hingeteam",
        "name": "Hinge Team",
        "age": 12,
        "job": "Designed to be deleted",
        "location": "Los Angeles",
        "photos": [
            {"caption": "The team", "label": "team photo"},
            {"caption": "Off-site, allegedly working", "label": "off-site photo"},
            {"caption": "Someone's whiteboard", "label": "whiteboard photo"},
        ],
        "prompts": [
            {"question": "My simple pleasures", "answer": "Watching a feature ship and nobody notices, because it just works."},
            {"question": "I'm looking for", "answer": "Feedback. Genuinely. That's the whole job."},
        ],
    },
]


def friend_profile(profile_id):
    return next((p for p in FRIEND_PROFILES if p["id"] == profile_id), None)


def _stamp_slots(profile):
    """Pin each photo to its seed position.

    Photo images are served by seed position, but Profile Review reorders the
    list — so a photo needs an identity that survives being moved. Without this,
    accepting a reorder would shuffle the pictures out from under the captions.
    """
    for slot, photo in enumerate(profile["photos"]):
        photo.setdefault("slot", slot)
    return profile


for _profile in [OWNER_PROFILE] + DECK + FRIEND_PROFILES:
    _stamp_slots(_profile)


def new_owner_profile():
    """A fresh, mutable copy of the owner's profile for one session."""
    return copy.deepcopy(OWNER_PROFILE)


def deck():
    return copy.deepcopy(DECK)


def profile_by_id(profile_id):
    """Any profile in the demo — owner, deck, or one of the wings."""
    if profile_id == OWNER_PROFILE["id"]:
        return OWNER_PROFILE
    for profile in DECK + FRIEND_PROFILES:
        if profile["id"] == profile_id:
            return profile
    return None
