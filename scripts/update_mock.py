import json
import math

file_path = '/Users/mileshillary/Desktop/museum/learning/projects/grey-plain/cognitive-trajectory/src/data/mockConversation.json'

with open(file_path, 'r') as f:
    data = json.load(f)

filler_words = {"a", "an", "the", "and", "but", "or", "so", "is", "are", "was", "were", "be", "been", "to", "of", "in", "on", "at", "with", "as", "for", "it", "this", "that", "i've", "like", "they", "have", "would", "keeps", "into", "do", "too", "does", "i", "we", "you", "he", "she", "my", "your", "our", "-", "—"}

count = 0
for turn in data:
    if turn.get('speaker') == 'human':
        text = turn['text']
        tokens = text.split(' ')  # space-split words
        
        weights = []
        for t in tokens:
            clean_t = t.lower().strip('.,!?()[]{}"\'—')
            if clean_t in filler_words or len(clean_t) <= 3:
                weights.append(0.1)
            else:
                weights.append(1.0)
                
        cum_weights = []
        current = 0
        for w in weights:
            current += w
            cum_weights.append(current)
            
        max_w = cum_weights[-1] if cum_weights[-1] > 0 else 1
        normalized_progress = [cw / max_w for cw in cum_weights]
        
        region_acts = turn['human']['regionActivations']
        
        token_activations = []
        for i, prog in enumerate(normalized_progress):
            act_step = {}
            for region, final_val in region_acts.items():
                start_val = 0.10 + (final_val * 0.1) # 0.1 to ~0.2 based on final_val
                
                if i == len(normalized_progress) - 1:
                    val = final_val
                else:
                    val = start_val + (final_val - start_val) * (prog ** 1.5) # power curve to make the jumps punchy
                
                act_step[region] = round(val, 2)
            token_activations.append(act_step)
            
        turn['human']['tokens'] = tokens
        turn['human']['tokenActivations'] = token_activations
        count += 1

with open(file_path, 'w') as f:
    json.dump(data, f, indent=2)

print(f"Updated {count} human turns in mockConversation.json.")
