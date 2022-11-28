import os
import json

def main():
    dict = {}
    for root, dirs, _ in os.walk("."):
        for name in dirs:
            print(os.path.join(root, name))
            dict[name] = []
            for _, _, photos in os.walk(name):
                for photo in photos:
                    if os.path.splitext(photo)[1] == ".jpeg":
                        print("Photo: ", photo)
                        dict[name].append(os.path.join(root, name, photo))

      
    # Serializing json  
    # json_object = json.dumps(dict, indent = 4) 
    with open("photos.json", "w") as outfile:
        json.dump(dict, outfile)

if __name__ == "__main__":
    main()