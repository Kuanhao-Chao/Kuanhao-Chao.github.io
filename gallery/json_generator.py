import os
import json

selected = ["./Me/00C3158C-82CD-4452-BE8C-8742F4713C91_1_105_c.jpeg", "./Canberra/505E817D-7F12-4BED-BD8F-3C7137BF4D59_1_105_c.jpeg", "./JHU/49D9C6E5-D5D0-48A2-9AAD-D7305D794F65_1_105_c.jpeg", "./ANU/A88B9279-2844-4632-A1FE-B9ADC1721B0C_1_105_c.jpeg", "./ANU/img3.jpeg", "./JHU/A2B92F06-A022-4E85-BF43-5D045E7A400E_1_105_c.jpeg", "./JHU/0572F33D-87FD-406D-ABF3-BAF40F9BA850_1_105_c.jpeg", "./JHU/57CC99BD-BA8F-4EB0-9F9B-E6F9775A730B.jpeg", "./Nature/01BDC575-CD5A-4677-BB8B-CB4B81C1DB02_1_105_c.jpeg"]
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

    dict["Selected"] = selected

      
    # Serializing json  
    # json_object = json.dumps(dict, indent = 4) 
    with open("photos.json", "w") as outfile:
        json.dump(dict, outfile)

if __name__ == "__main__":
    main()